"""
Silero-first VAD wrapper with webrtcvad fallback.

Primary target architecture uses local VAD gating before remote STT.

Root-cause notes (2026-06 voice-pipeline fix):
- The Silero VAD model accepts *exactly* 512 samples per call at 16 kHz
  (256 at 8 kHz). The previous implementation passed whole 100 ms chunks
  (1600 samples), which raises
  `ValueError: Provided number of samples is 1600 …` inside TorchScript.
  That exception was swallowed by a bare `except`, so `is_speech()` returned
  False forever — once a wake word armed command capture, the session never
  produced a segment and never ended ("always listening"). We now slice the
  incoming chunk into model-sized windows (carrying the remainder between
  calls) and report speech when any window crosses the threshold.
- The webrtcvad fallback only inspected the first 20 ms of each 100 ms chunk
  at aggressiveness 2, which is noisy in both directions. It now votes over
  every complete 20 ms frame at aggressiveness 3.
- A cheap RMS energy gate runs before either backend so silence and low-level
  background hiss never reach the model (poor-man's noise suppression in
  front of the VAD stage; see speech/denoise.py for the filtering stage).
- We prefer the offline `silero-vad` pip package (already in requirements)
  over `torch.hub.load`, which needs a network fetch on first run.
"""

from __future__ import annotations

import logging
import struct
from typing import Callable, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Per-call window sizes accepted by the Silero VAD model.
SILERO_WINDOW_16K = 512
SILERO_WINDOW_8K = 256

# Default speech-probability threshold for Silero.
DEFAULT_THRESHOLD = 0.5

# Normalised RMS (int16 RMS / 32768) below which a chunk is treated as
# silence without invoking the model. ~115 int16 RMS.
DEFAULT_ENERGY_GATE = 0.0035

# Fraction of 20 ms webrtcvad frames that must be voiced for a chunk to
# count as speech.
WEBRTC_SPEECH_RATIO = 0.3


class SileroVAD:
    def __init__(
        self,
        threshold: float = DEFAULT_THRESHOLD,
        energy_gate: float = DEFAULT_ENERGY_GATE,
        score_fn: Optional[Callable[[np.ndarray, int], float]] = None,
    ) -> None:
        self._threshold = float(threshold)
        self._energy_gate = float(energy_gate)
        self._model = None
        self._utils = None
        self._webrtc = None
        self._mode = "none"
        self._pending = b""
        if score_fn is not None:
            # Test/DI hook: score a single model-sized float32 window.
            self._score_fn = score_fn
            self._mode = "injected"
        else:
            self._score_fn = None
            self._load()

    def _load(self) -> None:
        try:
            from silero_vad import load_silero_vad

            self._model = load_silero_vad()
            self._mode = "silero"
            logger.info("Silero VAD loaded (silero-vad package).")
            return
        except Exception as exc:
            logger.debug("silero-vad package unavailable: %s", exc)

        try:
            import torch

            self._model, self._utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                trust_repo=True,
            )
            self._mode = "silero"
            logger.info("Silero VAD loaded (torch.hub).")
            return
        except Exception as exc:
            logger.warning("Silero VAD unavailable, falling back to webrtcvad: %s", exc)

        try:
            import webrtcvad

            self._webrtc = webrtcvad.Vad(3)
            self._mode = "webrtcvad"
            logger.info("WebRTC VAD fallback loaded (aggressiveness 3).")
        except Exception as exc:
            logger.warning("No VAD backend available: %s", exc)
            self._mode = "none"

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def available(self) -> bool:
        return self._mode != "none"

    @property
    def threshold(self) -> float:
        return self._threshold

    def set_threshold(self, threshold: float) -> None:
        value = float(threshold)
        if np.isfinite(value):
            self._threshold = min(max(value, 0.05), 0.99)

    def set_energy_gate(self, energy_gate: float) -> None:
        value = float(energy_gate)
        if np.isfinite(value) and value >= 0.0:
            self._energy_gate = value

    def reset(self) -> None:
        """Drop carry-over audio and model state at utterance boundaries."""
        self._pending = b""
        if self._model is not None and hasattr(self._model, "reset_states"):
            try:
                self._model.reset_states()
            except Exception:
                pass

    @staticmethod
    def _pcm_to_float32(pcm_bytes: bytes) -> np.ndarray:
        num_samples = len(pcm_bytes) // 2
        if num_samples <= 0:
            return np.zeros(0, dtype=np.float32)
        samples = struct.unpack(f"<{num_samples}h", pcm_bytes[: num_samples * 2])
        return np.array(samples, dtype=np.float32) / 32768.0

    @staticmethod
    def _normalized_rms(pcm_bytes: bytes) -> float:
        num_samples = len(pcm_bytes) // 2
        if num_samples <= 0:
            return 0.0
        samples = np.frombuffer(pcm_bytes[: num_samples * 2], dtype=np.int16).astype(np.float64)
        return float(np.sqrt(np.mean(samples * samples)) / 32768.0)

    def _silero_window_size(self, sample_rate: int) -> int:
        return SILERO_WINDOW_8K if int(sample_rate) == 8000 else SILERO_WINDOW_16K

    def _score_window(self, window_f32: np.ndarray, sample_rate: int) -> float:
        if self._score_fn is not None:
            return float(self._score_fn(window_f32, sample_rate))
        import torch

        with torch.no_grad():
            tensor = torch.from_numpy(np.ascontiguousarray(window_f32))
            return float(self._model(tensor, sample_rate).item())

    def is_speech(self, pcm_bytes: bytes, sample_rate: int = 16000) -> bool:
        if len(pcm_bytes) < 320:  # <10ms at 16kHz int16 mono
            return False

        # Energy gate: silence/hiss never reaches the model.
        if self._normalized_rms(pcm_bytes) < self._energy_gate:
            return False

        if self._mode in ("silero", "injected"):
            try:
                window_samples = self._silero_window_size(sample_rate)
                window_bytes = window_samples * 2
                data = self._pending + pcm_bytes
                offset = 0
                max_score = 0.0
                while offset + window_bytes <= len(data):
                    window = self._pcm_to_float32(data[offset:offset + window_bytes])
                    score = self._score_window(window, sample_rate)
                    if score > max_score:
                        max_score = score
                    offset += window_bytes
                # Carry the partial tail into the next call (bounded to one window).
                self._pending = data[offset:][-window_bytes:]
                return max_score >= self._threshold
            except Exception as exc:
                logger.debug("Silero VAD scoring error: %s", exc)
                return False

        if self._mode == "webrtcvad" and self._webrtc is not None:
            try:
                # WebRTC VAD expects 10/20/30ms frames — vote over all of them.
                frame_bytes = int(sample_rate * 0.02) * 2
                total = 0
                voiced = 0
                for offset in range(0, len(pcm_bytes) - frame_bytes + 1, frame_bytes):
                    total += 1
                    if self._webrtc.is_speech(pcm_bytes[offset:offset + frame_bytes], sample_rate):
                        voiced += 1
                if total == 0:
                    return False
                return (voiced / total) >= WEBRTC_SPEECH_RATIO
            except Exception:
                return False

        return False

"""
Silero-first VAD wrapper with webrtcvad fallback.

Primary target architecture uses local VAD gating before remote STT.
"""

from __future__ import annotations

import logging
import struct
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class SileroVAD:
    def __init__(self, threshold: float = 0.5) -> None:
        self._threshold = threshold
        self._model = None
        self._utils = None
        self._webrtc = None
        self._mode = "none"
        self._load()

    def _load(self) -> None:
        try:
            import torch

            self._model, self._utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                trust_repo=True,
            )
            self._mode = "silero"
            logger.info("Silero VAD loaded.")
            return
        except Exception as exc:
            logger.warning("Silero VAD unavailable, falling back to webrtcvad: %s", exc)

        try:
            import webrtcvad

            self._webrtc = webrtcvad.Vad(2)
            self._mode = "webrtcvad"
            logger.info("WebRTC VAD fallback loaded.")
        except Exception as exc:
            logger.warning("No VAD backend available: %s", exc)
            self._mode = "none"

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def available(self) -> bool:
        return self._mode != "none"

    def _pcm_to_float32(self, pcm_bytes: bytes) -> np.ndarray:
        num_samples = len(pcm_bytes) // 2
        if num_samples <= 0:
            return np.zeros(0, dtype=np.float32)
        samples = struct.unpack(f"<{num_samples}h", pcm_bytes[: num_samples * 2])
        return np.array(samples, dtype=np.float32) / 32768.0

    def is_speech(self, pcm_bytes: bytes, sample_rate: int = 16000) -> bool:
        if len(pcm_bytes) < 320:  # <10ms at 16kHz int16 mono
            return False

        if self._mode == "silero":
            try:
                import torch

                audio = self._pcm_to_float32(pcm_bytes)
                if audio.size == 0:
                    return False
                tensor = torch.tensor(audio, dtype=torch.float32)
                score = float(self._model(tensor, sample_rate).item())
                return score >= self._threshold
            except Exception:
                return False

        if self._mode == "webrtcvad" and self._webrtc is not None:
            try:
                # WebRTC VAD expects 10/20/30ms frames.
                frame_ms = 20
                frame_size = int(sample_rate * (frame_ms / 1000.0) * 2)
                if len(pcm_bytes) < frame_size:
                    return False
                frame = pcm_bytes[:frame_size]
                return bool(self._webrtc.is_speech(frame, sample_rate))
            except Exception:
                return False

        return False

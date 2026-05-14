"""
Whisper speech-to-text engine using faster-whisper.

Falls back gracefully when faster-whisper is not installed.
"""

from __future__ import annotations

import logging
import struct
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Minimum audio duration (seconds) to bother sending to Whisper.
MIN_AUDIO_SECONDS = 0.3
# Maximum chunk duration Whisper receives per transcription call (seconds).
MAX_AUDIO_SECONDS = 30.0
# Silence energy threshold for "is-final" heuristic.
SILENCE_ENERGY_THRESHOLD = 0.003


class WhisperSTT:
    """
    Wraps faster-whisper CTranslate2 inference for low-latency local STT.

    Model selection:
      - JARVIS_WHISPER_MODEL env var (default: "base")
      - Prefer "tiny.en" for English-only / lowest latency.
      - Use "small" or "medium" for better accuracy.
    """

    def __init__(self, model_size: Optional[str] = None, device: str = "cpu") -> None:
        import os
        self._model_size = model_size or os.environ.get("JARVIS_WHISPER_MODEL", "base")
        self._device = device
        self._model = None
        self._available = False
        self._load_model()

    def _load_model(self) -> None:
        try:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type="int8",
            )
            self._available = True
            logger.info("Whisper model '%s' loaded on %s.", self._model_size, self._device)
        except ImportError:
            logger.warning(
                "faster-whisper is not installed. STT is disabled. "
                "Install it with: pip install faster-whisper"
            )
        except Exception as exc:
            logger.warning("Failed to load Whisper model '%s': %s. STT disabled.", self._model_size, exc)

    @property
    def available(self) -> bool:
        return self._available

    def _pcm_to_float32(self, pcm_bytes: bytes) -> np.ndarray:
        """Convert PCM int16 LE bytes to float32 array in [-1, 1]."""
        num_samples = len(pcm_bytes) // 2
        if num_samples == 0:
            return np.zeros(0, dtype=np.float32)
        samples = struct.unpack(f"<{num_samples}h", pcm_bytes[:num_samples * 2])
        return np.array(samples, dtype=np.float32) / 32768.0

    def _is_silent(self, audio: np.ndarray) -> bool:
        """True if RMS energy is below the silence threshold."""
        if audio.size == 0:
            return True
        rms = float(np.sqrt(np.mean(audio ** 2)))
        return rms < SILENCE_ENERGY_THRESHOLD

    def transcribe_chunk(
        self,
        pcm_bytes: bytes,
        language: str = "en",
        sample_rate: int = 16000,
    ) -> Optional[dict]:
        """
        Transcribe a PCM audio chunk and return a result dict:
          { "text": str, "is_final": bool }

        Returns None if the audio is too short or silent.
        This is a blocking call — run it in an executor.
        """
        if not self._available or self._model is None:
            return None

        audio = self._pcm_to_float32(pcm_bytes)
        duration = len(audio) / sample_rate

        if duration < MIN_AUDIO_SECONDS:
            return None

        # Trim to MAX_AUDIO_SECONDS
        max_samples = int(MAX_AUDIO_SECONDS * sample_rate)
        if len(audio) > max_samples:
            audio = audio[-max_samples:]

        if self._is_silent(audio):
            return None

        try:
            segments, _info = self._model.transcribe(
                audio,
                language=language if language != "auto" else None,
                beam_size=5,
                vad_filter=True,
            )
            texts = [seg.text for seg in segments]
            full_text = " ".join(texts).strip()

            if not full_text:
                return None

            # Heuristic: treat as final if the last 0.5 s is silent
            tail = audio[-int(0.5 * sample_rate):]
            is_final = self._is_silent(tail)

            return {"text": full_text, "is_final": is_final}
        except Exception as exc:
            logger.debug("Whisper transcription error: %s", exc)
            return None

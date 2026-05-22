"""
Kokoro TTS wrapper with graceful fallback behavior.
"""

from __future__ import annotations

import io
import logging
import os
import wave
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_VOICE = os.environ.get("JARVIS_KOKORO_VOICE", "af_bella")
DEFAULT_SAMPLE_RATE = int(os.environ.get("JARVIS_KOKORO_SAMPLE_RATE", "24000"))


class KokoroTTS:
    def __init__(self, voice: Optional[str] = None) -> None:
        self._voice = voice or DEFAULT_VOICE
        self._available = False
        self._engine = None
        self._load_engine()

    def _load_engine(self) -> None:
        try:
            from kokoro import KPipeline  # type: ignore
            self._engine = KPipeline(lang_code="a")
            self._available = True
            logger.info("Kokoro TTS engine initialized.")
        except Exception as exc:
            self._available = False
            logger.warning("Kokoro TTS unavailable: %s", exc)

    @property
    def available(self) -> bool:
        return self._available

    def synthesize(self, text: str) -> bytes:
        value = str(text or "").strip()
        if not value:
            raise ValueError("Empty text passed to TTS.")
        if not self._available or self._engine is None:
            raise RuntimeError("Kokoro TTS is not available.")

        try:
            segments = self._engine(value, voice=self._voice, speed=1.0)
            pcm_chunks = []
            sample_rate = DEFAULT_SAMPLE_RATE
            for _, _, audio in segments:
                if audio is None:
                    continue
                arr = np.array(audio, dtype=np.float32)
                if arr.size == 0:
                    continue
                sample_rate = int(getattr(arr, "sample_rate", sample_rate) or sample_rate)
                pcm_chunks.append(np.clip(arr, -1.0, 1.0))
            if not pcm_chunks:
                raise RuntimeError("Kokoro produced no audio frames.")
            full = np.concatenate(pcm_chunks)
            int16 = (full * 32767).astype(np.int16)
            return _to_wav_bytes(int16.tobytes(), sample_rate)
        except Exception as exc:
            raise RuntimeError(f"Kokoro synthesis failed: {exc}") from exc


def _to_wav_bytes(pcm_bytes: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)
    return buf.getvalue()


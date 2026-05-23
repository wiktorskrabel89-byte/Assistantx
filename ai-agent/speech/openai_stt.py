"""
OpenAI Whisper API speech-to-text engine.

Mirrors the WhisperSTT interface so ai-agent/main.py can swap it in
transparently when engine_mode == 'cloud'.

WAV encoding uses only the Python standard library (io + wave),
ensuring the correct 16 000 Hz / int16 / mono format that matches
the microphone capture pipeline.
"""

from __future__ import annotations

import io
import logging
import os
import struct
import wave
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

OPENAI_WHISPER_MODEL = os.environ.get("JARVIS_OPENAI_STT_MODEL", "whisper-1")
AUDIO_SAMPLE_RATE = 16_000  # Hz — must match the mic capture rate in sidecar-bridge.js


class OpenAIWhisperSTT:
    """
    Cloud STT backend using OpenAI's Whisper API.

    Accepts the same raw PCM int16-LE bytes that WhisperSTT accepts and
    returns the same ``{ "text": str, "is_final": bool }`` dict.

    Requires the ``OPENAI_API_KEY`` environment variable.
    """

    def __init__(self, model: Optional[str] = None) -> None:
        self._model = model or OPENAI_WHISPER_MODEL
        self._client = None
        self._available = False
        self._load_client()

    def _load_client(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            logger.warning(
                "OPENAI_API_KEY is not set. Cloud STT (OpenAI Whisper) is disabled."
            )
            return
        try:
            import openai  # type: ignore
            self._client = openai.OpenAI(api_key=api_key)
            self._available = True
            logger.info("OpenAI Whisper STT client initialized (model: %s).", self._model)
        except ImportError:
            logger.warning(
                "openai package is not installed. "
                "Install it with: pip install openai"
            )
        except Exception as exc:
            logger.warning("Failed to initialize OpenAI Whisper STT: %s", exc)

    @property
    def available(self) -> bool:
        return self._available

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = AUDIO_SAMPLE_RATE) -> bytes:
        """
        Encode raw PCM int16-LE bytes to an in-memory WAV file.

        The OpenAI Whisper API requires a proper audio container (WAV/MP3/etc.)
        with the correct header.  Using the standard ``wave`` module guarantees
        that sample-rate, channel count, and bit-depth are encoded correctly
        regardless of the audio length.
        """
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)   # int16 → 2 bytes per sample
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)
        return buf.getvalue()

    @staticmethod
    def _is_silent(pcm_bytes: bytes, threshold: float = 0.003) -> bool:
        """True if the RMS energy of the audio chunk is below the silence threshold."""
        num_samples = len(pcm_bytes) // 2
        if num_samples == 0:
            return True
        samples = struct.unpack(f"<{num_samples}h", pcm_bytes[: num_samples * 2])
        arr = np.array(samples, dtype=np.float32) / 32768.0
        rms = float(np.sqrt(np.mean(arr ** 2)))
        return rms < threshold

    # ------------------------------------------------------------------
    # Public API (matches WhisperSTT.transcribe_chunk)
    # ------------------------------------------------------------------

    def transcribe_chunk(
        self,
        pcm_bytes: bytes,
        language: str = "en",
        sample_rate: int = AUDIO_SAMPLE_RATE,
    ) -> Optional[dict]:
        """
        Transcribe a PCM audio chunk using the OpenAI Whisper API.

        Returns ``{ "text": str, "is_final": bool }`` or ``None`` if the
        chunk is too short, silent, or the client is unavailable.

        This method is blocking — call it from a thread executor.
        """
        if not self._available or self._client is None:
            return None

        min_bytes = sample_rate * 2 * 1  # at least 1 second of audio
        if len(pcm_bytes) < min_bytes:
            return None

        if self._is_silent(pcm_bytes):
            return None

        try:
            wav_bytes = self._pcm_to_wav(pcm_bytes, sample_rate)
            wav_file = io.BytesIO(wav_bytes)
            wav_file.name = "audio.wav"  # required by the openai SDK

            lang_param = language if language not in ("auto", "") else None
            response = self._client.audio.transcriptions.create(
                model=self._model,
                file=wav_file,
                language=lang_param,
                response_format="text",
            )
            text = str(response or "").strip()
            if not text:
                return None

            # Heuristic: treat as final (same as local WhisperSTT)
            tail_bytes = pcm_bytes[-int(0.5 * sample_rate) * 2:]
            is_final = self._is_silent(tail_bytes)

            return {"text": text, "is_final": is_final}

        except Exception as exc:
            logger.debug("OpenAI Whisper transcription error: %s", exc)
            return None

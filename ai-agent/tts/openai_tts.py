"""
OpenAI TTS (tts-1 / tts-1-hd) cloud text-to-speech engine.

Mirrors the KokoroTTS interface so ai-agent/main.py can swap it in
transparently when engine_mode == 'cloud'.
"""

from __future__ import annotations

import io
import logging
import os
import wave
from typing import Optional

logger = logging.getLogger(__name__)

OPENAI_TTS_MODEL = os.environ.get("JARVIS_OPENAI_TTS_MODEL", "tts-1")
OPENAI_TTS_VOICE = os.environ.get("JARVIS_OPENAI_TTS_VOICE", "onyx")
OPENAI_TTS_SAMPLE_RATE = 24_000  # OpenAI TTS output is 24 kHz PCM


class OpenAICloudTTS:
    """
    Cloud TTS backend using OpenAI's speech synthesis API.

    The ``synthesize`` method returns WAV bytes in the same format
    as KokoroTTS / PiperTTS so the sidecar can treat them uniformly.

    Requires the ``OPENAI_API_KEY`` environment variable.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        voice: Optional[str] = None,
    ) -> None:
        self._model = model or OPENAI_TTS_MODEL
        self._voice = voice or OPENAI_TTS_VOICE
        self._client = None
        self._available = False
        self._load_client()

    def _load_client(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            logger.warning(
                "OPENAI_API_KEY is not set. Cloud TTS (OpenAI) is disabled."
            )
            return
        try:
            import openai  # type: ignore
            self._client = openai.OpenAI(api_key=api_key)
            self._available = True
            logger.info(
                "OpenAI Cloud TTS client initialized (model: %s, voice: %s).",
                self._model,
                self._voice,
            )
        except ImportError:
            logger.warning(
                "openai package is not installed. "
                "Install it with: pip install openai"
            )
        except Exception as exc:
            logger.warning("Failed to initialize OpenAI Cloud TTS: %s", exc)

    @property
    def available(self) -> bool:
        return self._available

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = OPENAI_TTS_SAMPLE_RATE) -> bytes:
        """Wrap raw PCM int16-LE bytes in a WAV container."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)
        return buf.getvalue()

    # ------------------------------------------------------------------
    # Public API (matches KokoroTTS.synthesize)
    # ------------------------------------------------------------------

    def synthesize(self, text: str) -> bytes:
        """
        Convert ``text`` to speech and return WAV bytes.

        The OpenAI API returns an MP3 stream; we request ``pcm`` format
        (raw int16 LE at 24 kHz) to avoid a decode dependency and wrap it
        ourselves in a WAV header that matches the sidecar's audio pipeline.

        Raises RuntimeError if TTS is unavailable or synthesis fails.
        """
        value = str(text or "").strip()
        if not value:
            raise ValueError("Empty text passed to OpenAI TTS.")
        if not self._available or self._client is None:
            raise RuntimeError("OpenAI Cloud TTS is not available.")

        try:
            # Request raw PCM so we avoid an MP3-decode dependency
            response = self._client.audio.speech.create(
                model=self._model,
                voice=self._voice,
                input=value,
                response_format="pcm",  # raw int16 LE, 24 kHz
            )
            pcm_bytes = response.read()
            if not pcm_bytes:
                raise RuntimeError("OpenAI TTS returned empty audio.")
            return self._pcm_to_wav(pcm_bytes, OPENAI_TTS_SAMPLE_RATE)
        except Exception as exc:
            raise RuntimeError(f"OpenAI TTS synthesis failed: {exc}") from exc

    def synthesize_streaming(self, text: str):
        """
        Generator that yields WAV-chunk bytes for each streamed PCM packet
        from the OpenAI TTS API.

        Each yielded value is a self-contained WAV buffer for a small PCM
        chunk, suitable for progressive audio playback.
        """
        value = str(text or "").strip()
        if not value:
            return
        if not self._available or self._client is None:
            raise RuntimeError("OpenAI Cloud TTS is not available.")

        CHUNK_BYTES = OPENAI_TTS_SAMPLE_RATE * 2 * 1  # 1 second of int16 at 24 kHz
        try:
            with self._client.audio.speech.with_streaming_response.create(
                model=self._model,
                voice=self._voice,
                input=value,
                response_format="pcm",
            ) as streaming_response:
                pcm_buffer = b""
                for chunk in streaming_response.iter_bytes(chunk_size=4096):
                    if not chunk:
                        continue
                    pcm_buffer += chunk
                    while len(pcm_buffer) >= CHUNK_BYTES:
                        yield self._pcm_to_wav(pcm_buffer[:CHUNK_BYTES], OPENAI_TTS_SAMPLE_RATE)
                        pcm_buffer = pcm_buffer[CHUNK_BYTES:]
                if pcm_buffer:
                    yield self._pcm_to_wav(pcm_buffer, OPENAI_TTS_SAMPLE_RATE)
        except Exception as exc:
            raise RuntimeError(f"OpenAI TTS streaming failed: {exc}") from exc

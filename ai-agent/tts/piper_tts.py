"""
Piper TTS engine.

Falls back gracefully when piper-tts is not installed, raising RuntimeError
so the sidecar can report the error without crashing.
"""

from __future__ import annotations

import io
import logging
import os
import wave
from typing import Optional

logger = logging.getLogger(__name__)

# Default voice model — override with JARVIS_PIPER_VOICE env var.
DEFAULT_VOICE = os.environ.get("JARVIS_PIPER_VOICE", "en_US-lessac-medium")


class PiperTTS:
    """
    Wraps the piper-tts library to synthesize text → WAV bytes.

    The synthesize() method returns raw WAV bytes (16-bit PCM, 22050 Hz mono)
    suitable for base64-encoding and sending back to the Electron renderer.
    """

    def __init__(self, voice: Optional[str] = None) -> None:
        self._voice_name = voice or DEFAULT_VOICE
        self._voice = None
        self._available = False
        self._load_voice()

    def _load_voice(self) -> None:
        try:
            from piper.voice import PiperVoice
            model_path = self._resolve_model_path()
            if model_path:
                self._voice = PiperVoice.load(model_path)
                self._available = True
                logger.info("Piper voice '%s' loaded.", self._voice_name)
            else:
                logger.warning(
                    "Piper voice model '%s' not found. "
                    "Download it and set JARVIS_PIPER_VOICE_PATH or use the default path.",
                    self._voice_name,
                )
        except ImportError:
            logger.warning(
                "piper-tts is not installed. TTS is disabled. "
                "Install it with: pip install piper-tts"
            )
        except Exception as exc:
            logger.warning("Failed to load Piper voice '%s': %s. TTS disabled.", self._voice_name, exc)

    def _resolve_model_path(self) -> Optional[str]:
        """
        Resolve the .onnx model file path for the selected voice.

        Search order:
        1. JARVIS_PIPER_VOICE_PATH env var (explicit model path)
        2. ~/.local/share/piper/voices/<voice>.onnx
        3. Relative path: voices/<voice>.onnx (next to this file)
        """
        explicit = os.environ.get("JARVIS_PIPER_VOICE_PATH", "").strip()
        if explicit and os.path.isfile(explicit):
            return explicit

        candidates = [
            os.path.expanduser(f"~/.local/share/piper/voices/{self._voice_name}.onnx"),
            os.path.join(os.path.dirname(__file__), "voices", f"{self._voice_name}.onnx"),
        ]
        for path in candidates:
            if os.path.isfile(path):
                return path

        return None

    @property
    def available(self) -> bool:
        return self._available

    def synthesize(self, text: str) -> bytes:
        """
        Synthesize text to WAV bytes.

        Raises RuntimeError if TTS is unavailable.
        This is a blocking call — run it in an executor.
        """
        if not self._available or self._voice is None:
            raise RuntimeError("Piper TTS is not available (model not loaded).")

        text = str(text or "").strip()
        if not text:
            raise ValueError("Empty text passed to TTS.")

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav_file:
            self._voice.synthesize(text, wav_file)

        return buf.getvalue()

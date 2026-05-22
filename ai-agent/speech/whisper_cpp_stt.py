"""
whisper.cpp speech-to-text wrapper (CPU-first).

This backend is optional. It is enabled when both:
  - JARVIS_WHISPER_CPP_BIN points to a whisper.cpp CLI binary
  - JARVIS_WHISPER_CPP_MODEL points to a model file
"""

from __future__ import annotations

import logging
import os
import shutil
import struct
import subprocess
import tempfile
import wave
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

MIN_AUDIO_SECONDS = 0.25
SILENCE_ENERGY_THRESHOLD = 0.003


class WhisperCppSTT:
    def __init__(self) -> None:
        self._binary = os.environ.get("JARVIS_WHISPER_CPP_BIN", "").strip()
        self._model = os.environ.get("JARVIS_WHISPER_CPP_MODEL", "").strip()
        self._threads = max(1, int(os.environ.get("JARVIS_WHISPER_CPP_THREADS", "6")))
        self._language = os.environ.get("JARVIS_WHISPER_CPP_LANGUAGE", "auto").strip() or "auto"
        self._timeout_seconds = max(2, int(os.environ.get("JARVIS_WHISPER_CPP_TIMEOUT_SECONDS", "12")))
        self._available = False
        self._load()

    @property
    def available(self) -> bool:
        return self._available

    def _load(self) -> None:
        if not self._binary or not self._model:
            logger.info("whisper.cpp STT disabled (binary/model env vars not provided).")
            self._available = False
            return
        resolved_bin = shutil.which(self._binary) if os.path.sep not in self._binary else self._binary
        if not resolved_bin or not os.path.isfile(resolved_bin):
            logger.warning("whisper.cpp binary not found: %s", self._binary)
            self._available = False
            return
        if not os.path.isfile(self._model):
            logger.warning("whisper.cpp model not found: %s", self._model)
            self._available = False
            return
        self._binary = resolved_bin
        self._available = True
        logger.info("whisper.cpp STT enabled with binary=%s model=%s", self._binary, self._model)

    def _pcm_to_float32(self, pcm_bytes: bytes) -> np.ndarray:
        num_samples = len(pcm_bytes) // 2
        if num_samples == 0:
            return np.zeros(0, dtype=np.float32)
        samples = struct.unpack(f"<{num_samples}h", pcm_bytes[: num_samples * 2])
        return np.array(samples, dtype=np.float32) / 32768.0

    def _is_silent(self, audio: np.ndarray) -> bool:
        if audio.size == 0:
            return True
        rms = float(np.sqrt(np.mean(audio ** 2)))
        return rms < SILENCE_ENERGY_THRESHOLD

    def _write_wav(self, path: str, pcm_bytes: bytes, sample_rate: int) -> None:
        with wave.open(path, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)

    def _parse_text(self, stdout: str) -> str:
        text_lines: list[str] = []
        for raw in stdout.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.startswith("[") and "]" in line:
                idx = line.rfind("]")
                fragment = line[idx + 1 :].strip()
                if fragment:
                    text_lines.append(fragment)
                continue
            if not line.startswith("whisper_"):
                text_lines.append(line)
        return " ".join(text_lines).strip()

    def transcribe_chunk(
        self,
        pcm_bytes: bytes,
        language: str = "en",
        sample_rate: int = 16000,
    ) -> Optional[dict]:
        if not self._available:
            return None

        audio = self._pcm_to_float32(pcm_bytes)
        duration = len(audio) / sample_rate
        if duration < MIN_AUDIO_SECONDS or self._is_silent(audio):
            return None

        with tempfile.TemporaryDirectory(prefix="jarvis-whispercpp-") as tmp:
            wav_path = os.path.join(tmp, "input.wav")
            self._write_wav(wav_path, pcm_bytes, sample_rate)

            cmd = [
                self._binary,
                "-m",
                self._model,
                "-f",
                wav_path,
                "-nt",
                "-t",
                str(self._threads),
            ]
            lang = (language or self._language or "auto").strip().lower()
            if lang != "auto":
                cmd.extend(["-l", lang])

            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=self._timeout_seconds,
                    check=False,
                )
                if proc.returncode != 0:
                    logger.debug("whisper.cpp returned non-zero exit code: %s", proc.stderr.strip())
                    return None
                text = self._parse_text(proc.stdout)
                if not text:
                    return None
                return {"text": text, "is_final": True}
            except Exception as exc:
                logger.debug("whisper.cpp transcription failed: %s", exc)
                return None

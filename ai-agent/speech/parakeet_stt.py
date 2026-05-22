"""
Parakeet STT engine (CPU ONNX) with graceful fallback.
"""

from __future__ import annotations

import logging
import os
import struct
from pathlib import Path
from typing import Optional

import numpy as np

from speech.model_downloader import ensure_parakeet_model

logger = logging.getLogger(__name__)

MIN_AUDIO_SECONDS = 0.3
SILENCE_ENERGY_THRESHOLD = 0.003


class ParakeetSTT:
    def __init__(self, model_dir: Optional[str] = None) -> None:
        self._available = False
        self._session = None
        self._input_name = None
        self._model_dir = model_dir or os.environ.get("JARVIS_PARAKEET_CACHE", "~/.jarvis/models/parakeet")
        self._load_model()

    @property
    def available(self) -> bool:
        return self._available

    def _load_model(self) -> None:
        model_root = ensure_parakeet_model(self._model_dir) or Path(self._model_dir).expanduser()
        model_path = _find_model_file(model_root)
        if not model_path:
            logger.warning("Parakeet ONNX model not found under %s", model_root)
            return
        try:
            import onnxruntime as ort
            self._session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
            self._input_name = self._session.get_inputs()[0].name
            self._available = True
            logger.info("Parakeet STT model loaded from %s", model_path)
        except Exception as exc:
            logger.warning("Failed to initialize Parakeet ONNX runtime: %s", exc)
            self._available = False

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

    def transcribe_chunk(
        self,
        pcm_bytes: bytes,
        language: str = "en",
        sample_rate: int = 16000,
    ) -> Optional[dict]:
        if not self._available or self._session is None:
            return None
        audio = self._pcm_to_float32(pcm_bytes)
        duration = len(audio) / sample_rate
        if duration < MIN_AUDIO_SECONDS or self._is_silent(audio):
            return None
        try:
            _ = language  # language kept for API compatibility
            # Placeholder decode path; model-specific tokenizer decoding can be added
            # once final Parakeet ONNX export interface is locked in this repo.
            _outputs = self._session.run(None, {self._input_name: audio.reshape(1, -1).astype(np.float32)})
            return {"text": "", "is_final": False}
        except Exception as exc:
            logger.debug("Parakeet transcription error: %s", exc)
            return None


def _find_model_file(root: Path) -> Path | None:
    if not root.exists():
        return None
    candidates = list(root.rglob("*.onnx"))
    if not candidates:
        return None
    preferred = [path for path in candidates if "parakeet" in path.name.lower()]
    return (preferred or candidates)[0]


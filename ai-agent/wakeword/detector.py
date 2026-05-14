"""
Wake word detector wrapping OpenWakeWord.

Falls back gracefully when openwakeword is not installed, so Electron can
still start the sidecar in a degraded (no-wake-word) mode.
"""

from __future__ import annotations

import logging
import struct
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Simple confidence threshold — frames with score above this trigger the wake event.
CONFIDENCE_THRESHOLD = 0.6


class WakeWordDetector:
    """
    Thin wrapper around openwakeword.Model that processes PCM int16 audio chunks
    and returns True when a wake word is detected.
    """

    def __init__(self, model_paths: Optional[list[str]] = None) -> None:
        self._model = None
        self._model_paths = model_paths or []
        self._available = False
        self._load_model()

    def _load_model(self) -> None:
        try:
            import openwakeword  # noqa: F401
            from openwakeword.model import Model

            if self._model_paths:
                self._model = Model(wakeword_models=self._model_paths, inference_framework="onnx")
            else:
                # Download/use default "hey_jarvis" model if available, else "hey_mycroft"
                self._model = Model(inference_framework="onnx")

            self._available = True
            logger.info("OpenWakeWord model loaded successfully.")
        except ImportError:
            logger.warning(
                "openwakeword is not installed. Wake word detection is disabled. "
                "Install it with: pip install openwakeword"
            )
        except Exception as exc:
            logger.warning("Failed to load OpenWakeWord model: %s. Degraded mode active.", exc)

    @property
    def available(self) -> bool:
        return self._available

    def process_chunk(self, pcm_bytes: bytes, sample_rate: int = 16000) -> bool:
        """
        Process one audio chunk (PCM int16 LE bytes) and return True if the
        wake word is detected with sufficient confidence.

        This is a blocking call — run it in an executor.
        """
        if not self._available or self._model is None:
            return False

        if len(pcm_bytes) < 2:
            return False

        # Convert PCM int16 bytes → float32 in [-1, 1]
        num_samples = len(pcm_bytes) // 2
        samples = struct.unpack(f"<{num_samples}h", pcm_bytes[:num_samples * 2])
        audio_f32 = np.array(samples, dtype=np.float32) / 32768.0

        try:
            prediction = self._model.predict(audio_f32)
            # prediction is a dict of {model_name: float_confidence}
            if not prediction:
                return False
            max_conf = max(prediction.values())
            if max_conf >= CONFIDENCE_THRESHOLD:
                logger.debug("Wake word detected (confidence=%.3f)", max_conf)
                return True
        except Exception as exc:
            logger.debug("Wake word prediction error: %s", exc)

        return False

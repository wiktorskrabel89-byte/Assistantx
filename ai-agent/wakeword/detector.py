"""
Wake word detector wrapping OpenWakeWord.

Falls back gracefully when openwakeword is not installed (or its model files
cannot be downloaded), so Electron can still start the sidecar in a degraded
(no-wake-word) mode — but the degradation reason is now logged loudly and
exposed via `unavailable_reason` so the UI can surface it instead of silently
never waking.

Root-cause notes (2026-06 voice-pipeline fix):
- OpenWakeWord expects audio at int16 scale. The previous implementation
  normalised samples to float32 in [-1, 1], which the melspectrogram
  frontend interprets as near-silence — scores never crossed the threshold,
  so "Hey Jarvis" effectively never triggered. The reference implementation
  (`Model.predict_clip`) feeds raw `np.int16` arrays directly.
- The previous implementation loaded *every* pretrained model (alexa,
  hey_mycroft, timer, weather, …) and triggered on `max()` across all of
  them, so any phrase resembling any model — or noise — could wake Jarvis.
  We now load and score only the configured wake models.
- Model files are not bundled with the pip package; without an explicit
  `download_models()` call the Model() constructor raises and detection was
  silently disabled. We now download the selected model on first use.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Score above this triggers the wake event. 0.5 is the openwakeword-recommended
# starting point; runtime-adjustable via set_threshold()/set_sensitivity().
DEFAULT_CONFIDENCE_THRESHOLD = 0.5

# Ignore repeat detections inside this window so one utterance of the wake
# phrase cannot fire multiple wake events back-to-back.
DEFAULT_REFRACTORY_SECONDS = 2.0

# Only the Jarvis wake model is loaded/scored by default.
DEFAULT_WAKE_MODELS = ("hey_jarvis",)


class WakeWordDetector:
    """
    Thin wrapper around openwakeword.Model that processes PCM int16 audio chunks
    and returns True when a wake word is detected.
    """

    def __init__(
        self,
        model_paths: Optional[list[str]] = None,
        model_names: Optional[list[str]] = None,
        threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
        refractory_seconds: float = DEFAULT_REFRACTORY_SECONDS,
        download_if_missing: bool = True,
        model: Any = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._model = model
        self._model_paths = model_paths or []
        self._model_names = [str(n).strip().lower() for n in (model_names or DEFAULT_WAKE_MODELS) if str(n).strip()]
        self._threshold = float(threshold)
        self._refractory_seconds = float(refractory_seconds)
        self._download_if_missing = bool(download_if_missing)
        self._clock = clock
        self._available = model is not None
        self._unavailable_reason = "" if model is not None else "not-loaded"
        self._last_detection_at = float("-inf")
        self.last_score = 0.0
        if model is None:
            self._load_model()

    def _load_model(self) -> None:
        try:
            import openwakeword  # noqa: F401
            from openwakeword.model import Model
        except ImportError:
            self._unavailable_reason = "openwakeword-not-installed"
            logger.warning(
                "openwakeword is not installed. Wake word detection is disabled. "
                "Install it with: pip install openwakeword"
            )
            return

        try:
            if self._model_paths:
                self._model = Model(wakeword_models=self._model_paths, inference_framework="onnx")
            else:
                if self._download_if_missing:
                    try:
                        from openwakeword.utils import download_models

                        # No-op when the model files are already on disk.
                        download_models(model_names=list(self._model_names))
                    except Exception as exc:
                        logger.warning("Wake model download failed (offline?): %s", exc)
                self._model = Model(wakeword_models=list(self._model_names), inference_framework="onnx")

            self._available = True
            self._unavailable_reason = ""
            logger.info("OpenWakeWord model loaded (models=%s).", self._model_names or self._model_paths)
        except Exception as exc:
            self._unavailable_reason = f"model-load-failed: {exc}"
            logger.warning("Failed to load OpenWakeWord model: %s. Degraded mode active.", exc)

    @property
    def available(self) -> bool:
        return self._available

    @property
    def unavailable_reason(self) -> str:
        return self._unavailable_reason

    @property
    def threshold(self) -> float:
        return self._threshold

    def set_threshold(self, threshold: float) -> None:
        value = float(threshold)
        if not np.isfinite(value):
            return
        self._threshold = min(max(value, 0.05), 0.99)

    def set_sensitivity(self, sensitivity: float) -> None:
        """
        Map a user-facing 0..1 sensitivity slider onto the confidence threshold.
        0.0 → strict (threshold 0.9), 0.5 → balanced (~0.55), 1.0 → eager (0.2).
        """
        value = float(sensitivity)
        if not np.isfinite(value):
            return
        value = min(max(value, 0.0), 1.0)
        self.set_threshold(0.9 - 0.7 * value)

    def _is_selected_model(self, prediction_key: str) -> bool:
        if not self._model_names:
            return True
        key = str(prediction_key).strip().lower()
        return any(name in key for name in self._model_names)

    def reset(self) -> None:
        if self._model is not None and hasattr(self._model, "reset"):
            try:
                self._model.reset()
            except Exception:
                pass

    def process_chunk(self, pcm_bytes: bytes, sample_rate: int = 16000) -> bool:
        """
        Process one audio chunk (PCM int16 LE bytes) and return True if the
        wake word is detected with sufficient confidence.

        openwakeword buffers internally, so arbitrary chunk sizes are fine
        (multiples of 80 ms / 1280 samples are merely optimal).

        This is a blocking call — run it in an executor.
        """
        if not self._available or self._model is None:
            return False

        usable = len(pcm_bytes) - (len(pcm_bytes) % 2)
        if usable < 2:
            return False

        # int16 scale, NOT normalised floats — see module docstring.
        samples = np.frombuffer(pcm_bytes[:usable], dtype=np.int16)

        try:
            prediction = self._model.predict(samples)
            if not prediction:
                return False
            score = max(
                (float(v) for k, v in prediction.items() if self._is_selected_model(k)),
                default=0.0,
            )
            self.last_score = score
            if score < self._threshold:
                return False
            now = self._clock()
            if now - self._last_detection_at < self._refractory_seconds:
                return False
            self._last_detection_at = now
            logger.debug("Wake word detected (confidence=%.3f)", score)
            # Clear streaming buffers so residual wake-phrase audio cannot
            # re-trigger or bleed into the command capture that follows.
            self.reset()
            return True
        except Exception as exc:
            logger.debug("Wake word prediction error: %s", exc)

        return False

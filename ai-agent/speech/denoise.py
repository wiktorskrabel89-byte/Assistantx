"""
Input noise suppression for the mic pipeline.

Two stages, both optional and cheap to disable:

1. `process_chunk()` — a stateful DC-blocking one-pole high-pass filter
   (default cutoff ~120 Hz) applied to every live 100 ms chunk *before* the
   wake-word and VAD stages. Removes rumble, electrical hum and DC offset
   that inflate RMS and cause VAD false positives. Pure numpy, O(n).

2. `process_segment()` — spectral noise reduction over a complete utterance
   segment *before* it is shipped to STT. Uses the `noisereduce` package
   (WebRTC-NS-style spectral gating) when installed; falls back to the
   high-pass filter otherwise. Heavier, but only runs once per utterance.

The renderer additionally requests `noiseSuppression: true` from
getUserMedia, so the browser's WebRTC NS runs in front of this module when
the OS/driver supports it. This module guarantees a suppression stage even
when that constraint is ignored.
"""

from __future__ import annotations

import logging
import math
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_HIGHPASS_HZ = 120.0


class NoiseSuppressor:
    def __init__(
        self,
        enabled: bool = True,
        sample_rate: int = 16000,
        highpass_hz: float = DEFAULT_HIGHPASS_HZ,
    ) -> None:
        self.enabled = bool(enabled)
        self._sample_rate = int(sample_rate)
        self._highpass_hz = float(highpass_hz)
        self._alpha = self._compute_alpha(self._sample_rate, self._highpass_hz)
        self._prev_x = 0.0
        self._prev_y = 0.0
        self._nr = None
        try:
            import noisereduce  # type: ignore

            self._nr = noisereduce
            logger.info("noisereduce available — spectral gating enabled for STT segments.")
        except Exception:
            logger.debug("noisereduce not installed — segment denoise falls back to high-pass only.")
        self._lfilter = None
        try:
            from scipy.signal import lfilter  # type: ignore

            self._lfilter = lfilter
        except Exception:
            self._lfilter = None

    @staticmethod
    def _compute_alpha(sample_rate: int, cutoff_hz: float) -> float:
        if cutoff_hz <= 0 or sample_rate <= 0:
            return 1.0
        rc = 1.0 / (2.0 * math.pi * cutoff_hz)
        dt = 1.0 / float(sample_rate)
        return rc / (rc + dt)

    def configure(self, enabled: Optional[bool] = None, sample_rate: Optional[int] = None) -> None:
        if enabled is not None:
            self.enabled = bool(enabled)
        if sample_rate is not None and int(sample_rate) > 0 and int(sample_rate) != self._sample_rate:
            self._sample_rate = int(sample_rate)
            self._alpha = self._compute_alpha(self._sample_rate, self._highpass_hz)
            self.reset()

    def reset(self) -> None:
        self._prev_x = 0.0
        self._prev_y = 0.0

    @staticmethod
    def _to_int16(pcm_bytes: bytes) -> np.ndarray:
        usable = len(pcm_bytes) - (len(pcm_bytes) % 2)
        if usable <= 0:
            return np.zeros(0, dtype=np.int16)
        return np.frombuffer(pcm_bytes[:usable], dtype=np.int16)

    def process_chunk(self, pcm_bytes: bytes) -> bytes:
        """High-pass one live chunk (PCM int16 LE). Stateful across calls."""
        if not self.enabled:
            return pcm_bytes
        samples = self._to_int16(pcm_bytes)
        if samples.size == 0:
            return pcm_bytes
        x = samples.astype(np.float64)
        alpha = self._alpha
        if self._lfilter is not None:
            # y[n] = alpha*y[n-1] + alpha*(x[n] - x[n-1]) as an IIR filter with
            # carried state: zi = alpha*(y_prev - x_prev).
            b = np.array([alpha, -alpha])
            a = np.array([1.0, -alpha])
            zi = np.array([alpha * (self._prev_y - self._prev_x)])
            y, zf = self._lfilter(b, a, x, zi=zi)
            self._prev_x = float(x[-1])
            self._prev_y = float(y[-1])
        else:
            y = np.empty_like(x)
            prev_x = self._prev_x
            prev_y = self._prev_y
            for i in range(x.size):
                prev_y = alpha * (prev_y + x[i] - prev_x)
                prev_x = x[i]
                y[i] = prev_y
            self._prev_x = prev_x
            self._prev_y = prev_y
        return np.clip(y, -32768, 32767).astype(np.int16).tobytes()

    def process_segment(self, pcm_bytes: bytes, sample_rate: Optional[int] = None) -> bytes:
        """Denoise a full utterance segment before STT."""
        if not self.enabled:
            return pcm_bytes
        rate = int(sample_rate or self._sample_rate)
        samples = self._to_int16(pcm_bytes)
        if samples.size == 0:
            return pcm_bytes
        if self._nr is None:
            # Stateless high-pass pass over the whole segment (separate state
            # so the live-chunk filter is unaffected).
            scratch = NoiseSuppressor(enabled=True, sample_rate=rate, highpass_hz=self._highpass_hz)
            scratch._nr = None
            return scratch.process_chunk(pcm_bytes)
        try:
            audio = samples.astype(np.float32) / 32768.0
            reduced = self._nr.reduce_noise(y=audio, sr=rate, stationary=True, prop_decrease=0.85)
            return np.clip(reduced * 32768.0, -32768, 32767).astype(np.int16).tobytes()
        except Exception as exc:
            logger.debug("noisereduce failed, returning original segment: %s", exc)
            return pcm_bytes

"""Unit tests for the VAD stage (speech/vad.py).

Covers the regressions fixed in the 2026-06 voice-pipeline overhaul:
- Silero must be fed exactly 512-sample windows at 16 kHz (the old code
  passed whole 100 ms chunks and silently failed forever).
- The energy gate must reject silence/low-level noise before the model runs.
- The webrtcvad fallback must vote over all 20 ms frames, not just the first.
"""

import struct
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from speech.vad import (  # noqa: E402
    DEFAULT_ENERGY_GATE,
    SILERO_WINDOW_16K,
    SileroVAD,
)

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1600  # 100 ms at 16 kHz — what the desktop client streams


def pcm_silence(samples: int = CHUNK_SAMPLES) -> bytes:
    return b"\x00\x00" * samples


def pcm_tone(samples: int = CHUNK_SAMPLES, amplitude: int = 12000, freq: float = 440.0) -> bytes:
    t = np.arange(samples, dtype=np.float64) / SAMPLE_RATE
    wave = (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.int16)
    return wave.tobytes()


def pcm_noise(samples: int = CHUNK_SAMPLES, amplitude: int = 60, seed: int = 7) -> bytes:
    rng = np.random.default_rng(seed)
    wave = rng.integers(-amplitude, amplitude, size=samples, dtype=np.int16)
    return wave.tobytes()


class RecordingScoreFn:
    """Injected in place of the Silero model; records every window it sees."""

    def __init__(self, score: float = 0.0):
        self.score = score
        self.windows = []

    def __call__(self, window: np.ndarray, sample_rate: int) -> float:
        self.windows.append((window.copy(), sample_rate))
        return self.score


class SileroWindowingTests(unittest.TestCase):
    def test_speech_chunk_is_split_into_model_sized_windows(self):
        score_fn = RecordingScoreFn(score=0.9)
        vad = SileroVAD(score_fn=score_fn)

        self.assertTrue(vad.is_speech(pcm_tone(), SAMPLE_RATE))
        self.assertGreater(len(score_fn.windows), 0)
        for window, rate in score_fn.windows:
            self.assertEqual(window.shape[0], SILERO_WINDOW_16K)
            self.assertEqual(rate, SAMPLE_RATE)

    def test_remainder_carries_across_calls(self):
        score_fn = RecordingScoreFn(score=0.9)
        vad = SileroVAD(score_fn=score_fn)

        vad.is_speech(pcm_tone(), SAMPLE_RATE)
        first_call_windows = len(score_fn.windows)
        # 1600 samples → 3 full 512-sample windows, 64 samples carried over.
        self.assertEqual(first_call_windows, 3)

        vad.is_speech(pcm_tone(), SAMPLE_RATE)
        # 64 carried + 1600 new = 1664 → 3 more windows, 128 carried.
        self.assertEqual(len(score_fn.windows), 6)

    def test_threshold_decides_speech(self):
        vad_quiet = SileroVAD(score_fn=RecordingScoreFn(score=0.2))
        vad_loud = SileroVAD(score_fn=RecordingScoreFn(score=0.8))

        self.assertFalse(vad_quiet.is_speech(pcm_tone(), SAMPLE_RATE))
        self.assertTrue(vad_loud.is_speech(pcm_tone(), SAMPLE_RATE))

    def test_set_threshold_is_clamped_and_applied(self):
        vad = SileroVAD(score_fn=RecordingScoreFn(score=0.5))
        vad.set_threshold(0.6)
        self.assertFalse(vad.is_speech(pcm_tone(), SAMPLE_RATE))
        vad.set_threshold(0.4)
        self.assertTrue(vad.is_speech(pcm_tone(), SAMPLE_RATE))
        vad.set_threshold(5.0)
        self.assertLessEqual(vad.threshold, 0.99)

    def test_reset_clears_carryover(self):
        score_fn = RecordingScoreFn(score=0.9)
        vad = SileroVAD(score_fn=score_fn)
        vad.is_speech(pcm_tone(), SAMPLE_RATE)
        vad.reset()
        score_fn.windows.clear()
        vad.is_speech(pcm_tone(), SAMPLE_RATE)
        # Fresh state → exactly 3 windows from 1600 samples again.
        self.assertEqual(len(score_fn.windows), 3)


class EnergyGateTests(unittest.TestCase):
    def test_silence_never_reaches_the_model(self):
        score_fn = RecordingScoreFn(score=0.99)
        vad = SileroVAD(score_fn=score_fn)

        self.assertFalse(vad.is_speech(pcm_silence(), SAMPLE_RATE))
        self.assertEqual(score_fn.windows, [])

    def test_low_level_noise_is_gated(self):
        score_fn = RecordingScoreFn(score=0.99)
        vad = SileroVAD(score_fn=score_fn)

        self.assertFalse(vad.is_speech(pcm_noise(amplitude=60), SAMPLE_RATE))
        self.assertEqual(score_fn.windows, [])

    def test_tiny_chunks_are_rejected(self):
        vad = SileroVAD(score_fn=RecordingScoreFn(score=0.99))
        self.assertFalse(vad.is_speech(b"\x00\x00" * 10, SAMPLE_RATE))

    def test_gate_default_is_sane(self):
        # The gate must sit well below conversational speech levels
        # (~3000+ int16 RMS) but above electrical noise floors.
        self.assertGreater(DEFAULT_ENERGY_GATE, 0.0)
        self.assertLess(DEFAULT_ENERGY_GATE, 0.05)


class FakeWebRtcVad:
    def __init__(self, pattern):
        self._pattern = list(pattern)
        self._index = 0
        self.frame_sizes = []

    def is_speech(self, frame: bytes, sample_rate: int) -> bool:
        self.frame_sizes.append(len(frame))
        value = self._pattern[self._index % len(self._pattern)]
        self._index += 1
        return value


class WebRtcFallbackTests(unittest.TestCase):
    def _make_webrtc_vad(self, pattern):
        vad = SileroVAD(score_fn=RecordingScoreFn(score=0.0))
        vad._mode = "webrtcvad"
        vad._score_fn = None
        vad._webrtc = FakeWebRtcVad(pattern)
        return vad

    def test_all_frames_are_evaluated(self):
        vad = self._make_webrtc_vad([True])
        vad.is_speech(pcm_tone(), SAMPLE_RATE)
        # 100 ms chunk → five 20 ms frames of 640 bytes each.
        self.assertEqual(len(vad._webrtc.frame_sizes), 5)
        self.assertTrue(all(size == 640 for size in vad._webrtc.frame_sizes))

    def test_majority_style_vote(self):
        # 2/5 voiced (40%) ≥ 30% ratio → speech.
        self.assertTrue(
            self._make_webrtc_vad([True, True, False, False, False]).is_speech(pcm_tone(), SAMPLE_RATE)
        )
        # 1/5 voiced (20%) < 30% ratio → not speech (single-frame glitches
        # no longer arm the capture path).
        self.assertFalse(
            self._make_webrtc_vad([True, False, False, False, False]).is_speech(pcm_tone(), SAMPLE_RATE)
        )


class PcmHelpersTests(unittest.TestCase):
    def test_pcm_to_float32_scale(self):
        pcm = struct.pack("<4h", 0, 16384, -16384, 32767)
        floats = SileroVAD._pcm_to_float32(pcm)
        self.assertAlmostEqual(floats[0], 0.0)
        self.assertAlmostEqual(floats[1], 0.5, places=3)
        self.assertAlmostEqual(floats[2], -0.5, places=3)

    def test_normalized_rms(self):
        self.assertEqual(SileroVAD._normalized_rms(pcm_silence()), 0.0)
        loud = SileroVAD._normalized_rms(pcm_tone(amplitude=16384))
        self.assertGreater(loud, 0.3)


if __name__ == "__main__":
    unittest.main()

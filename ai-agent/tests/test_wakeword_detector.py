"""Unit tests for the wake-word detector (wakeword/detector.py).

Covers the regressions fixed in the 2026-06 voice-pipeline overhaul:
- Audio must reach OpenWakeWord at int16 scale (the old code normalised to
  [-1, 1], which the model frontend hears as silence → wake never fired).
- Only the configured wake models may trigger (the old code took max() over
  every loaded pretrained model — alexa, timers, weather… → false wakes).
- A refractory window must absorb duplicate detections.
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wakeword.detector import WakeWordDetector  # noqa: E402

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1600


def pcm_tone(amplitude: int = 12000, samples: int = CHUNK_SAMPLES) -> bytes:
    t = np.arange(samples, dtype=np.float64) / SAMPLE_RATE
    return (amplitude * np.sin(2 * np.pi * 300.0 * t)).astype(np.int16).tobytes()


class FakeOwwModel:
    def __init__(self, predictions):
        # predictions: list of dicts returned per predict() call (last repeats)
        self._predictions = list(predictions)
        self._index = 0
        self.received = []
        self.reset_calls = 0

    def predict(self, x):
        self.received.append(np.array(x))
        result = self._predictions[min(self._index, len(self._predictions) - 1)]
        self._index += 1
        return result

    def reset(self):
        self.reset_calls += 1


class FakeClock:
    def __init__(self, start: float = 1000.0):
        self.now = start

    def __call__(self) -> float:
        return self.now


class InputScaleTests(unittest.TestCase):
    def test_audio_reaches_model_at_int16_scale(self):
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.0}])
        detector = WakeWordDetector(model=model)

        detector.process_chunk(pcm_tone(amplitude=12000), SAMPLE_RATE)

        self.assertEqual(len(model.received), 1)
        received = model.received[0]
        self.assertEqual(received.dtype, np.int16)
        # int16 scale, not [-1, 1]: a 12000-amplitude tone must keep its range.
        self.assertGreater(int(np.abs(received).max()), 10000)

    def test_odd_byte_tail_is_dropped_not_crashed(self):
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.0}])
        detector = WakeWordDetector(model=model)
        detector.process_chunk(pcm_tone() + b"\x01", SAMPLE_RATE)
        self.assertEqual(model.received[0].shape[0], CHUNK_SAMPLES)


class ThresholdAndFilterTests(unittest.TestCase):
    def test_detects_above_threshold(self):
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.75}])
        detector = WakeWordDetector(model=model, threshold=0.5)
        self.assertTrue(detector.process_chunk(pcm_tone(), SAMPLE_RATE))
        self.assertAlmostEqual(detector.last_score, 0.75)

    def test_ignores_below_threshold(self):
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.4}])
        detector = WakeWordDetector(model=model, threshold=0.5)
        self.assertFalse(detector.process_chunk(pcm_tone(), SAMPLE_RATE))

    def test_non_selected_models_cannot_trigger(self):
        # alexa at 0.99 must NOT wake Jarvis (the historical false-trigger bug)
        model = FakeOwwModel([{"alexa_v0.1": 0.99, "hey_jarvis_v0.1": 0.1}])
        detector = WakeWordDetector(model=model, threshold=0.5)
        self.assertFalse(detector.process_chunk(pcm_tone(), SAMPLE_RATE))

    def test_selected_model_triggers_among_others(self):
        model = FakeOwwModel([{"alexa_v0.1": 0.2, "hey_jarvis_v0.1": 0.9}])
        detector = WakeWordDetector(model=model, threshold=0.5)
        self.assertTrue(detector.process_chunk(pcm_tone(), SAMPLE_RATE))

    def test_silence_scores_do_not_trigger(self):
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.01}])
        detector = WakeWordDetector(model=model, threshold=0.5)
        for _ in range(20):
            self.assertFalse(detector.process_chunk(pcm_tone(amplitude=30), SAMPLE_RATE))


class RefractoryTests(unittest.TestCase):
    def test_repeat_detection_is_absorbed_within_refractory_window(self):
        clock = FakeClock()
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.9}])
        detector = WakeWordDetector(model=model, threshold=0.5, refractory_seconds=2.0, clock=clock)

        self.assertTrue(detector.process_chunk(pcm_tone(), SAMPLE_RATE))
        clock.now += 0.5
        self.assertFalse(detector.process_chunk(pcm_tone(), SAMPLE_RATE))
        clock.now += 2.0
        self.assertTrue(detector.process_chunk(pcm_tone(), SAMPLE_RATE))

    def test_model_state_reset_after_detection(self):
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.9}])
        detector = WakeWordDetector(model=model, threshold=0.5)
        detector.process_chunk(pcm_tone(), SAMPLE_RATE)
        self.assertEqual(model.reset_calls, 1)


class SensitivityTests(unittest.TestCase):
    def test_sensitivity_maps_to_threshold(self):
        model = FakeOwwModel([{"hey_jarvis_v0.1": 0.5}])
        detector = WakeWordDetector(model=model)
        detector.set_sensitivity(0.0)
        self.assertAlmostEqual(detector.threshold, 0.9, places=5)
        detector.set_sensitivity(1.0)
        self.assertAlmostEqual(detector.threshold, 0.2, places=5)
        detector.set_sensitivity(0.5)
        self.assertAlmostEqual(detector.threshold, 0.55, places=5)

    def test_sensitivity_is_clamped(self):
        detector = WakeWordDetector(model=FakeOwwModel([{}]))
        detector.set_sensitivity(99.0)
        self.assertGreaterEqual(detector.threshold, 0.05)
        detector.set_sensitivity(-5.0)
        self.assertLessEqual(detector.threshold, 0.99)

    def test_threshold_setter_rejects_nan(self):
        detector = WakeWordDetector(model=FakeOwwModel([{}]), threshold=0.5)
        detector.set_threshold(float("nan"))
        self.assertAlmostEqual(detector.threshold, 0.5)


class SensitivityPresetTests(unittest.TestCase):
    def test_known_presets_map_to_documented_thresholds(self):
        from wakeword.detector import SENSITIVITY_PRESETS
        detector = WakeWordDetector(model=FakeOwwModel([{}]))
        for name, expected in SENSITIVITY_PRESETS.items():
            self.assertTrue(detector.set_sensitivity_preset(name))
            self.assertAlmostEqual(detector.threshold, expected)
            self.assertEqual(detector.sensitivity_preset, name)

    def test_unknown_preset_is_a_no_op(self):
        detector = WakeWordDetector(model=FakeOwwModel([{}]), threshold=0.42)
        self.assertFalse(detector.set_sensitivity_preset("ultra-mega-eager"))
        self.assertAlmostEqual(detector.threshold, 0.42)

    def test_no_preset_is_ever_below_the_never_ship_floor(self):
        # Spec: never ship a preset at/below 0.60 — too many false activations.
        from wakeword.detector import SENSITIVITY_PRESETS
        for value in SENSITIVITY_PRESETS.values():
            self.assertGreaterEqual(value, 0.75)

    def test_preset_name_is_case_and_whitespace_insensitive(self):
        detector = WakeWordDetector(model=FakeOwwModel([{}]))
        self.assertTrue(detector.set_sensitivity_preset("  STRICT  "))
        self.assertAlmostEqual(detector.threshold, 0.90)


class DegradedModeTests(unittest.TestCase):
    def test_unavailable_detector_never_triggers(self):
        detector = WakeWordDetector(model=None, download_if_missing=False, model_names=["definitely-not-a-model"])
        if detector.available:
            self.skipTest("environment unexpectedly provides this model")
        self.assertFalse(detector.process_chunk(pcm_tone(), SAMPLE_RATE))
        self.assertNotEqual(detector.unavailable_reason, "")


if __name__ == "__main__":
    unittest.main()

"""Unit tests for the input noise-suppression stage (speech/denoise.py)."""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from speech.denoise import NoiseSuppressor  # noqa: E402

SAMPLE_RATE = 16000


def sine_pcm(freq: float, amplitude: int = 8000, seconds: float = 0.5) -> bytes:
    t = np.arange(int(SAMPLE_RATE * seconds), dtype=np.float64) / SAMPLE_RATE
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.int16).tobytes()


def rms(pcm: bytes) -> float:
    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float64)
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(samples * samples)))


class HighPassChunkTests(unittest.TestCase):
    def test_dc_offset_is_removed(self):
        suppressor = NoiseSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        dc = (np.full(SAMPLE_RATE // 2, 5000, dtype=np.int16)).tobytes()
        out = suppressor.process_chunk(dc)
        out_samples = np.frombuffer(out, dtype=np.int16).astype(np.float64)
        # After the transient, the mean must collapse towards zero.
        steady_state = out_samples[len(out_samples) // 2:]
        self.assertLess(abs(float(np.mean(steady_state))), 100.0)

    def test_speech_band_is_preserved(self):
        suppressor = NoiseSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        voice_like = sine_pcm(440.0)
        out = suppressor.process_chunk(voice_like)
        self.assertGreater(rms(out), 0.7 * rms(voice_like))

    def test_low_frequency_hum_is_attenuated(self):
        suppressor = NoiseSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        hum = sine_pcm(50.0)
        out = suppressor.process_chunk(hum)
        self.assertLess(rms(out), 0.5 * rms(hum))

    def test_disabled_is_a_passthrough(self):
        suppressor = NoiseSuppressor(enabled=False)
        chunk = sine_pcm(50.0)
        self.assertEqual(suppressor.process_chunk(chunk), chunk)

    def test_state_carries_across_chunks_without_glitch(self):
        suppressor = NoiseSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        full = sine_pcm(440.0, seconds=0.2)
        # Processing in two halves must equal processing in one piece.
        half = len(full) // 2
        half -= half % 2
        chunked = suppressor.process_chunk(full[:half]) + suppressor.process_chunk(full[half:])
        suppressor2 = NoiseSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        whole = suppressor2.process_chunk(full)
        a = np.frombuffer(chunked, dtype=np.int16).astype(np.int32)
        b = np.frombuffer(whole, dtype=np.int16).astype(np.int32)
        self.assertEqual(a.shape, b.shape)
        self.assertLessEqual(int(np.abs(a - b).max()), 1)  # rounding-only diff

    def test_output_length_matches_input(self):
        suppressor = NoiseSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        chunk = sine_pcm(200.0, seconds=0.1)
        self.assertEqual(len(suppressor.process_chunk(chunk)), len(chunk))


class SegmentTests(unittest.TestCase):
    def test_segment_denoise_returns_same_length_int16(self):
        suppressor = NoiseSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        segment = sine_pcm(440.0, seconds=1.0)
        out = suppressor.process_segment(segment, SAMPLE_RATE)
        self.assertEqual(len(out), len(segment))

    def test_segment_disabled_is_a_passthrough(self):
        suppressor = NoiseSuppressor(enabled=False)
        segment = sine_pcm(440.0)
        self.assertEqual(suppressor.process_segment(segment, SAMPLE_RATE), segment)


if __name__ == "__main__":
    unittest.main()

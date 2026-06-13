"""Integration tests for the sidecar audio pipeline (main.py).

Simulates the desktop client streaming base64 PCM chunks into
`_handle_audio_chunk` with controllable wake/VAD engines and asserts the
end-to-end contract:

- silence / background noise never produces wake or segment events,
- wake word arms command capture,
- speech followed by trailing silence emits exactly one `audio_segment`
  containing the spoken audio (the STT input),
- the half-duplex playback gate drops mic input while TTS plays,
- an armed-but-silent session times out instead of listening forever.
"""

import asyncio
import base64
import sys
import time
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main  # noqa: E402
from speech.vad import SileroVAD  # noqa: E402

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1600  # 100 ms


def tone_chunk(amplitude: int = 12000) -> bytes:
    t = np.arange(CHUNK_SAMPLES, dtype=np.float64) / SAMPLE_RATE
    return (amplitude * np.sin(2 * np.pi * 300.0 * t)).astype(np.int16).tobytes()


def silence_chunk() -> bytes:
    return b"\x00\x00" * CHUNK_SAMPLES


def noise_chunk(amplitude: int = 50, seed: int = 3) -> bytes:
    rng = np.random.default_rng(seed)
    return rng.integers(-amplitude, amplitude, size=CHUNK_SAMPLES, dtype=np.int16).tobytes()


def encode(pcm: bytes) -> str:
    return base64.b64encode(pcm).decode("ascii")


class FakeWakeDetector:
    """Triggers when a chunk's max amplitude exceeds the trigger level."""

    def __init__(self, trigger_amplitude: int = 8000):
        self.trigger_amplitude = trigger_amplitude
        self.available = True
        self.chunks_seen = 0

    def process_chunk(self, pcm_bytes: bytes, sample_rate: int = SAMPLE_RATE) -> bool:
        self.chunks_seen += 1
        samples = np.frombuffer(pcm_bytes[: len(pcm_bytes) // 2 * 2], dtype=np.int16)
        if samples.size == 0:
            return False
        return int(np.abs(samples).max()) >= self.trigger_amplitude

    def reset(self):
        pass

    def set_sensitivity(self, _value):
        pass


class FakeWs:
    remote_address = ("127.0.0.1", 0)

    async def send(self, _payload):
        pass


def drain_events(state) -> list:
    events = []
    while not state.outbound_queue.empty():
        events.append(state.outbound_queue.get_nowait())
    return events


def events_of(events: list, event_type: str) -> list:
    return [e for e in events if e.get("type") == event_type]


class PipelineHarness:
    """Wires fake/synthetic engines into main's lazy singletons."""

    def __init__(self):
        self._saved = (main._wake_detector, main._vad_engine, main._noise_suppressor)
        self.wake = FakeWakeDetector()
        # Real VAD windowing/energy-gate logic with a synthetic scorer:
        # loud windows score 0.95, quiet windows 0.05.
        self.vad = SileroVAD(score_fn=lambda window, sr: 0.95 if float(np.abs(window).max()) > 0.05 else 0.05)
        main._wake_detector = self.wake
        main._vad_engine = self.vad
        main._noise_suppressor = None  # lazily built only if a test enables it
        self.ws = FakeWs()
        self.state = main.ConnectionState()
        self.state.noise_suppression_enabled = False

    def restore(self):
        main._wake_detector, main._vad_engine, main._noise_suppressor = self._saved

    async def push(self, pcm: bytes):
        await main._handle_audio_chunk(self.ws, self.state, {"data": encode(pcm)})

    async def push_many(self, pcm: bytes, count: int):
        for _ in range(count):
            await self.push(pcm)


class SilenceAndNoiseTests(unittest.TestCase):
    def setUp(self):
        self.harness = PipelineHarness()
        self.addCleanup(self.harness.restore)

    def test_silence_produces_no_wake_and_no_segments(self):
        async def run():
            await self.harness.push_many(silence_chunk(), 30)

        asyncio.run(run())
        events = drain_events(self.harness.state)
        self.assertEqual(events_of(events, "wake_word"), [])
        self.assertEqual(events_of(events, "audio_segment"), [])
        self.assertFalse(self.harness.state.listening_for_command)

    def test_background_noise_produces_no_segments_when_armed(self):
        async def run():
            self.harness.state.listening_for_command = True
            self.harness.state.listen_started_at = time.monotonic()
            await self.harness.push_many(noise_chunk(), 20)

        asyncio.run(run())
        events = drain_events(self.harness.state)
        self.assertEqual(events_of(events, "audio_segment"), [])
        # Low-level noise must never even start a speech window.
        self.assertEqual(events_of(events, "vad_event"), [])


class WakeToSegmentTests(unittest.TestCase):
    def setUp(self):
        self.harness = PipelineHarness()
        self.addCleanup(self.harness.restore)

    def test_wake_word_arms_command_listening(self):
        async def run():
            await self.harness.push(tone_chunk())

        asyncio.run(run())
        events = drain_events(self.harness.state)
        self.assertEqual(len(events_of(events, "wake_word")), 1)
        self.assertTrue(self.harness.state.listening_for_command)
        self.assertEqual(self.harness.state.runtime_state, "listening")

    def test_full_round_trip_speech_to_single_segment(self):
        async def run():
            # 1. wake
            await self.harness.push(tone_chunk())
            # 2. speak for 5 chunks (500 ms)
            await self.harness.push_many(tone_chunk(), 5)
            # 3. trailing silence closes the utterance (0.45 s → 5 chunks)
            await self.harness.push_many(silence_chunk(), 6)

        asyncio.run(run())
        events = drain_events(self.harness.state)

        segments = events_of(events, "audio_segment")
        self.assertEqual(len(segments), 1)

        vad_phases = [e["phase"] for e in events_of(events, "vad_event")]
        self.assertIn("speech_start", vad_phases)
        self.assertIn("speech_end", vad_phases)

        # The segment must contain the spoken audio (≥ the 5 speech chunks)
        # and be valid int16 PCM (even byte count — the old `.strip()` could
        # break alignment).
        segment = base64.b64decode(segments[0]["data"])
        self.assertEqual(len(segment) % 2, 0)
        self.assertGreaterEqual(len(segment), 5 * CHUNK_SAMPLES * 2)

        # Session is closed afterwards — no stuck "always listening".
        self.assertFalse(self.harness.state.listening_for_command)
        self.assertEqual(self.harness.state.runtime_state, "idle")

    def test_no_double_wake_inside_one_session(self):
        async def run():
            await self.harness.push(tone_chunk())  # wake
            await self.harness.push_many(tone_chunk(), 3)  # speech, no second wake

        asyncio.run(run())
        events = drain_events(self.harness.state)
        self.assertEqual(len(events_of(events, "wake_word")), 1)


class PlaybackGateTests(unittest.TestCase):
    def setUp(self):
        self.harness = PipelineHarness()
        self.addCleanup(self.harness.restore)

    def test_mic_input_is_dropped_while_tts_plays(self):
        async def run():
            await main._handle_playback_state(self.harness.ws, self.harness.state, {"active": True})
            # Loud "speech" arriving while Jarvis speaks — must be ignored.
            await self.harness.push_many(tone_chunk(), 10)

        asyncio.run(run())
        events = drain_events(self.harness.state)
        self.assertEqual(events_of(events, "wake_word"), [])
        self.assertEqual(events_of(events, "audio_segment"), [])
        self.assertEqual(self.harness.wake.chunks_seen, 0)

    def test_pipeline_resumes_after_playback_ends(self):
        async def run():
            await main._handle_playback_state(self.harness.ws, self.harness.state, {"active": True})
            await self.harness.push_many(tone_chunk(), 3)
            await main._handle_playback_state(self.harness.ws, self.harness.state, {"active": False})
            await self.harness.push(tone_chunk())

        asyncio.run(run())
        events = drain_events(self.harness.state)
        self.assertEqual(len(events_of(events, "wake_word")), 1)

    def test_playback_start_clears_partial_capture(self):
        async def run():
            self.harness.state.listening_for_command = True
            self.harness.state.listen_started_at = time.monotonic()
            await self.harness.push_many(tone_chunk(), 2)  # partial speech buffered
            await main._handle_playback_state(self.harness.ws, self.harness.state, {"active": True})

        asyncio.run(run())
        self.assertEqual(self.harness.state.command_audio_buffer, [])
        self.assertFalse(self.harness.state.speech_active)


class ListenTimeoutTests(unittest.TestCase):
    def setUp(self):
        self.harness = PipelineHarness()
        self.addCleanup(self.harness.restore)

    def test_armed_but_silent_session_times_out(self):
        async def run():
            self.harness.state.listening_for_command = True
            # Pretend the wake fired long ago.
            self.harness.state.listen_started_at = time.monotonic() - (main.LISTEN_TIMEOUT_SECONDS + 1)
            await self.harness.push(silence_chunk())

        asyncio.run(run())
        events = drain_events(self.harness.state)
        phases = [e["phase"] for e in events_of(events, "vad_event")]
        self.assertIn("listen_timeout", phases)
        self.assertFalse(self.harness.state.listening_for_command)
        self.assertEqual(self.harness.state.runtime_state, "idle")


class NoiseSuppressionIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.harness = PipelineHarness()
        self.addCleanup(self.harness.restore)

    def test_suppression_stage_runs_when_enabled(self):
        from speech.denoise import NoiseSuppressor

        calls = []

        class RecordingSuppressor(NoiseSuppressor):
            def process_chunk(self, pcm_bytes):
                calls.append(len(pcm_bytes))
                return super().process_chunk(pcm_bytes)

        main._noise_suppressor = RecordingSuppressor(enabled=True, sample_rate=SAMPLE_RATE)
        self.harness.state.noise_suppression_enabled = True

        async def run():
            await self.harness.push(tone_chunk())

        asyncio.run(run())
        self.assertEqual(calls, [CHUNK_SAMPLES * 2])


if __name__ == "__main__":
    unittest.main()

"""Unit tests for the audio-session context probe (context/audio_session_probe.py).

Uses an injected fake session provider (constructor DI), mirroring
WakeWordDetector's `model=` injection pattern in test_wakeword_detector.py —
no real pycaw/WASAPI calls happen in this suite.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from context.audio_session_probe import (  # noqa: E402
    KNOWN_MEDIA_PROCESSES,
    SESSION_STATE_ACTIVE,
    AudioSessionProbe,
)


class FakeProcess:
    def __init__(self, name: str):
        self._name = name

    def name(self) -> str:
        return self._name


class FakeVolume:
    def __init__(self, muted: bool = False):
        self._muted = muted

    def GetMute(self) -> bool:
        return self._muted


class FakeSession:
    def __init__(self, process_name, state=SESSION_STATE_ACTIVE, muted=False, no_volume=False):
        self.Process = FakeProcess(process_name) if process_name is not None else None
        self.State = state
        self.SimpleAudioVolume = None if no_volume else FakeVolume(muted)


class FakeClock:
    def __init__(self, start: float = 1000.0):
        self.now = start

    def __call__(self) -> float:
        return self.now


class ClassificationTests(unittest.TestCase):
    def test_known_active_unmuted_process_is_reported(self):
        probe = AudioSessionProbe(session_provider=lambda: [FakeSession("Spotify.exe")])
        self.assertEqual(probe.get_active_media_sources(), ["spotify"])

    def test_unknown_process_is_ignored(self):
        probe = AudioSessionProbe(session_provider=lambda: [FakeSession("notepad.exe")])
        self.assertEqual(probe.get_active_media_sources(), [])

    def test_inactive_session_does_not_count(self):
        probe = AudioSessionProbe(session_provider=lambda: [FakeSession("chrome.exe", state=0)])
        self.assertEqual(probe.get_active_media_sources(), [])

    def test_muted_session_does_not_count(self):
        probe = AudioSessionProbe(session_provider=lambda: [FakeSession("Discord.exe", muted=True)])
        self.assertEqual(probe.get_active_media_sources(), [])

    def test_process_name_match_is_case_insensitive(self):
        probe = AudioSessionProbe(session_provider=lambda: [FakeSession("CHROME.EXE")])
        self.assertEqual(probe.get_active_media_sources(), ["browser"])

    def test_missing_volume_interface_does_not_crash(self):
        probe = AudioSessionProbe(session_provider=lambda: [FakeSession("msedge.exe", no_volume=True)])
        self.assertEqual(probe.get_active_media_sources(), ["browser"])

    def test_session_without_process_is_skipped(self):
        probe = AudioSessionProbe(session_provider=lambda: [FakeSession(None)])
        self.assertEqual(probe.get_active_media_sources(), [])

    def test_multiple_known_sources_are_deduplicated_and_sorted(self):
        sessions = [
            FakeSession("chrome.exe"),
            FakeSession("msedge.exe"),  # also "browser" -> de-duplicated
            FakeSession("Discord.exe"),
        ]
        probe = AudioSessionProbe(session_provider=lambda: sessions)
        self.assertEqual(probe.get_active_media_sources(), ["browser", "discord"])

    def test_enumeration_error_returns_empty_list(self):
        def raising_provider():
            raise OSError("COM call failed")

        probe = AudioSessionProbe(session_provider=raising_provider)
        self.assertEqual(probe.get_active_media_sources(), [])


class CachingTests(unittest.TestCase):
    def test_result_is_cached_within_ttl(self):
        clock = FakeClock()
        calls = []

        def provider():
            calls.append(1)
            return [FakeSession("Spotify.exe")] if len(calls) == 1 else [FakeSession("Discord.exe")]

        probe = AudioSessionProbe(session_provider=provider, cache_ttl_seconds=0.25, clock=clock)
        self.assertEqual(probe.get_active_media_sources(), ["spotify"])
        clock.now += 0.1
        # Still within the TTL: must reuse the cached result, not re-enumerate.
        self.assertEqual(probe.get_active_media_sources(), ["spotify"])
        self.assertEqual(len(calls), 1)

    def test_cache_expires_after_ttl(self):
        clock = FakeClock()
        calls = []

        def provider():
            calls.append(1)
            return [FakeSession("Spotify.exe")] if len(calls) == 1 else [FakeSession("Discord.exe")]

        probe = AudioSessionProbe(session_provider=provider, cache_ttl_seconds=0.25, clock=clock)
        self.assertEqual(probe.get_active_media_sources(), ["spotify"])
        clock.now += 0.30
        self.assertEqual(probe.get_active_media_sources(), ["discord"])
        self.assertEqual(len(calls), 2)


class DegradedModeTests(unittest.TestCase):
    def test_no_provider_off_windows_or_without_pycaw_is_unavailable(self):
        # Without injecting a provider, real auto-detection runs. On a
        # non-Windows CI box (or Windows without pycaw installed) this must
        # degrade gracefully rather than raise.
        probe = AudioSessionProbe()
        if not probe.available:
            self.assertNotEqual(probe.unavailable_reason, "")
            self.assertEqual(probe.get_active_media_sources(), [])

    def test_unavailable_probe_never_raises(self):
        probe = AudioSessionProbe(session_provider=None, cache_ttl_seconds=0.25)
        probe._available = False  # simulate degraded mode regardless of host platform
        probe._session_provider = None
        self.assertEqual(probe.get_active_media_sources(), [])


class KnownProcessTableTests(unittest.TestCase):
    def test_known_media_processes_cover_spec_list(self):
        for proc in ("chrome.exe", "msedge.exe", "firefox.exe", "spotify.exe", "discord.exe"):
            self.assertIn(proc, KNOWN_MEDIA_PROCESSES)


if __name__ == "__main__":
    unittest.main()

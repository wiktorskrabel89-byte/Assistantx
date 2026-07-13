"""
Audio-session context probe (Phase 2, 2026-06 voice-activation upgrade).

Detects whether a "known media" process (browser tab, Spotify, Discord) is
actively outputting audio right now, so the wake-word decision-fusion engine
(`_evaluate_activation_decision` in main.py) can treat a borderline wake-word
candidate as more likely a false trigger from video/music/a call instead of
an actual spoken wake phrase.

Wraps pycaw (Windows WASAPI session enumeration). Degrades gracefully off-
Windows or when pycaw is unavailable, mirroring WakeWordDetector's
available/unavailable_reason pattern so the UI can surface *why* context
awareness isn't active instead of it silently never suppressing anything.

Deliberately uses session.State (WASAPI's coarse Active/Inactive/Expired
enum) plus a mute check rather than IAudioMeterInformation peak-meter
queries: the peak meter is a separate, version-fragile COM interface that's
hard to fake in tests and not reliably present across pycaw versions/audio
drivers. State is stable, well-documented, and sufficient to answer "is this
process plausibly making sound right now" — exact loudness isn't needed,
only presence.
"""

from __future__ import annotations

import logging
import sys
import time
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# Process name (lowercase) -> human-readable label surfaced in
# breakdown["contextSources"] / Transparency Mode.
KNOWN_MEDIA_PROCESSES: dict[str, str] = {
    "chrome.exe": "browser",
    "msedge.exe": "browser",
    "firefox.exe": "browser",
    "spotify.exe": "spotify",
    "discord.exe": "discord",
}

# WASAPI IAudioSessionControl2.State: 0=Inactive, 1=Active, 2=Expired.
SESSION_STATE_ACTIVE = 1

# GetAllSessions() is a COM call — not free to make on every ~100ms audio
# chunk, so results are cached for this long. Only ever consulted from the
# decision-fusion mid-band (already gated to wake-word candidates only), not
# per-chunk, but the cache keeps back-to-back candidates cheap too.
DEFAULT_CACHE_TTL_SECONDS = 0.25


class AudioSessionProbe:
    """
    Reports which known media processes currently have an active, unmuted
    audio session.

    `session_provider`, when given, replaces the pycaw
    AudioUtilities.GetAllSessions() call entirely — dependency injection for
    tests, mirroring WakeWordDetector's `model=` constructor injection. Each
    item it returns must duck-type a pycaw session: `.Process` (with
    `.name()`), `.State`, and `.SimpleAudioVolume.GetMute()`.
    """

    def __init__(
        self,
        session_provider: Optional[Callable[[], list]] = None,
        cache_ttl_seconds: float = DEFAULT_CACHE_TTL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._session_provider = session_provider
        self._cache_ttl_seconds = float(cache_ttl_seconds)
        self._clock = clock
        self._available = session_provider is not None
        self._unavailable_reason = "" if session_provider is not None else "not-loaded"
        self._cached_sources: list[str] = []
        self._cached_at = float("-inf")
        if session_provider is None:
            self._load_provider()

    def _load_provider(self) -> None:
        if sys.platform != "win32":
            self._unavailable_reason = "unsupported-platform"
            logger.info("Audio session context probe disabled: not running on Windows.")
            return
        try:
            from pycaw.pycaw import AudioUtilities
        except ImportError:
            self._unavailable_reason = "pycaw-not-installed"
            logger.warning(
                "pycaw is not installed. Context-awareness is disabled. "
                "Install it with: pip install pycaw"
            )
            return

        self._session_provider = AudioUtilities.GetAllSessions
        self._available = True
        self._unavailable_reason = ""
        logger.info("Audio session context probe ready (pycaw/WASAPI).")

    @property
    def available(self) -> bool:
        return self._available

    @property
    def unavailable_reason(self) -> str:
        return self._unavailable_reason

    def get_active_media_sources(self) -> list[str]:
        """
        Returns sorted, de-duplicated labels (e.g. ["browser", "discord"])
        for every known media process with an active, unmuted audio session
        right now. Cached for `cache_ttl_seconds` since the underlying
        enumeration is a COM call.
        """
        if not self._available or self._session_provider is None:
            return []

        now = self._clock()
        if now - self._cached_at < self._cache_ttl_seconds:
            return list(self._cached_sources)

        sources: set[str] = set()
        try:
            sessions = self._session_provider() or []
            for session in sessions:
                label = self._classify(session)
                if label is not None:
                    sources.add(label)
        except Exception as exc:
            logger.debug("Audio session enumeration failed: %s", exc)

        self._cached_sources = sorted(sources)
        self._cached_at = now
        return list(self._cached_sources)

    def _classify(self, session: Any) -> Optional[str]:
        process = getattr(session, "Process", None)
        if process is None:
            return None
        try:
            name = str(process.name() or "").strip().lower()
        except Exception:
            return None
        label = KNOWN_MEDIA_PROCESSES.get(name)
        if label is None:
            return None
        if not self._is_actively_peaking(session):
            return None
        return label

    def _is_actively_peaking(self, session: Any) -> bool:
        if getattr(session, "State", None) != SESSION_STATE_ACTIVE:
            return False
        try:
            volume = session.SimpleAudioVolume
            if volume is not None and volume.GetMute():
                return False
        except Exception:
            pass
        return True

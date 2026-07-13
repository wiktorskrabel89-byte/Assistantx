"""Throwaway latency spike for Phase 0 of the voice-activation upgrade.

Question this answers: once a wake-word score lands in the "tie-break" band
(Phase 1's rule-table row 3), can Whisper verification (Phase 3) and voice
matching (Phase 5) run *synchronously* inside the candidate path — i.e.
`asyncio.gather` over two `run_in_executor` calls, so added latency is
max(whisper, voice_match) rather than their sum — or is that slow enough to
need an "optimistic capture, activate immediately, retroactively cancel"
restructure instead?

Not part of the test suite (no test_ prefix, not collected by pytest). Run
manually on a machine that actually has faster-whisper/resemblyzer installed:

    python ai-agent/tests/bench_verification_latency.py

This sidecar's dev sandbox does not have faster-whisper or resemblyzer
installed (they install into the packaged app's bundled Python via
ensure-python-deps.js, not this shell's interpreter) — see the ANALYSIS
block below for the decision made without live numbers, and re-run this
for real confirmation once those packages are present.
"""

from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SAMPLE_RATE = 16000
CLIP_SECONDS = 1.5
RUNS = 5


def synthetic_speech_clip(seconds: float = CLIP_SECONDS) -> bytes:
    """A short, non-silent int16 PCM clip — stands in for a real "hey jarvis"
    utterance. Real speech vs. a tone doesn't change executor/IO overhead,
    which is what this spike actually measures (model load + inference
    scheduling), not transcription accuracy."""
    n = int(seconds * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    tone = 8000 * np.sin(2 * np.pi * 220.0 * t) * np.sin(2 * np.pi * 2.0 * t)
    return tone.astype(np.int16).tobytes()


def bench_whisper() -> list[float]:
    from main import _get_stt_engine  # noqa: E402

    engine = _get_stt_engine()
    if not getattr(engine, "available", False):
        print("  [skip] no STT engine available in this environment")
        return []

    clip = synthetic_speech_clip()
    # Warm-up call: pays model load cost once, outside the timed loop.
    engine.transcribe_chunk(clip, "en", SAMPLE_RATE)

    samples = []
    for _ in range(RUNS):
        start = time.perf_counter()
        engine.transcribe_chunk(clip, "en", SAMPLE_RATE)
        samples.append(time.perf_counter() - start)
    return samples


def bench_voice_match() -> list[float]:
    try:
        from resemblyzer import VoiceEncoder
    except ImportError:
        print("  [skip] resemblyzer not installed in this environment")
        return []

    encoder = VoiceEncoder()
    clip = synthetic_speech_clip()
    wav = np.frombuffer(clip, dtype=np.int16).astype(np.float32) / 32768.0

    encoder.embed_utterance(wav)  # warm-up

    samples = []
    for _ in range(RUNS):
        start = time.perf_counter()
        encoder.embed_utterance(wav)
        samples.append(time.perf_counter() - start)
    return samples


def _report(label: str, samples: list[float]) -> None:
    if not samples:
        print(f"{label}: no data (engine unavailable in this environment)")
        return
    print(
        f"{label}: mean={statistics.mean(samples) * 1000:.1f}ms "
        f"max={max(samples) * 1000:.1f}ms over {len(samples)} runs"
    )


# ── ANALYSIS (Phase 0 decision, recorded ahead of live numbers) ─────────────
#
# This dev sandbox's Python interpreter does not have faster-whisper or
# resemblyzer installed (see module docstring), so the numbers below could
# not be measured live in this session. Decision made instead from each
# library's documented behaviour:
#
# - Whisper verification only runs on Phase 1 rule-table row 3 (tie-break),
#   not on every wake attempt — rows 1 (fast-path, score >= 0.92) and 2
#   (clear accept) skip it entirely. It only pays its cost on the genuinely
#   ambiguous minority of attempts.
# - faster-whisper/whisper.cpp on a short (1-2s) clip with a base/small model
#   on CPU is well-documented to land roughly in the 300ms-1.5s range
#   (this sidecar already pays this exact cost today on the legacy STT
#   fallback path at main.py's `_handle_audio_chunk`, and on first-call
#   warm-up in `_start_model_download_background`) — noticeable but not
#   disruptive for a rare disambiguation step.
# - resemblyzer's VoiceEncoder is a small (~17MB) LSTM specifically designed
#   for near-real-time speaker diarization; single-utterance embedding on
#   CPU is documented at well under 200ms for clips this short.
#
# Running both through `asyncio.gather` over two `loop.run_in_executor(None,
# ...)` calls makes the added latency max(whisper, voice_match) ≈ whisper's
# own cost, not their sum — and that cost is only paid in the ambiguous
# tie-break case. That is an acceptable trade against the alternative
# (an "optimistic capture, retroactively cancel" state machine), which adds
# real complexity (a window where Jarvis has already started responding to
# a command that verification might still reject) for a case that only
# fires on a minority of borderline attempts.
#
# DECISION: run verification synchronously via asyncio.gather + run_in_executor,
# per the plan's stated default. Re-run this script for real once
# faster-whisper/resemblyzer are installed (e.g. on the packaged app's
# bundled Python) to confirm; if real numbers ever show either call
# regularly exceeding ~2s, revisit with the optimistic-capture restructure.

if __name__ == "__main__":
    print(f"Benchmarking on a {CLIP_SECONDS}s synthetic clip, {RUNS} runs each.\n")
    print("Whisper STT (transcribe_chunk):")
    _report("  whisper", bench_whisper())
    print("\nVoice match (resemblyzer embed_utterance):")
    _report("  voice_match", bench_voice_match())

"""
Model downloader helpers for lazy local voice model setup.

Each public `ensure_*` function:
  - checks whether the model weights already exist on disk
  - downloads them from Hugging Face if absent
  - emits ``status`` progress messages via an optional async callback
    so the Electron splash screen can render a live progress bar

The downloaders are designed to be run in a background thread
(asyncio.get_event_loop().run_in_executor) so the WebSocket heartbeat
is never blocked.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# ── Repository / file defaults ────────────────────────────────────────────────

DEFAULT_PARAKEET_REPO = os.environ.get(
    "JARVIS_PARAKEET_HF_REPO",
    "nvidia/parakeet-tdt-0.6b-v3",
)

WHISPER_MODEL_REPOS = {
    "tiny":   "guillaumekln/faster-whisper-tiny",
    "base":   "guillaumekln/faster-whisper-base",
    "small":  "guillaumekln/faster-whisper-small",
    "medium": "guillaumekln/faster-whisper-medium",
    "large":  "guillaumekln/faster-whisper-large-v3",
}

KOKORO_REPO = os.environ.get("JARVIS_KOKORO_HF_REPO", "hexgrad/Kokoro-82M")

PIPER_MODEL_URLS = {
    "en": os.environ.get(
        "JARVIS_PIPER_EN_URL",
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
    ),
    "pl": os.environ.get(
        "JARVIS_PIPER_PL_URL",
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/darkman/medium/pl_PL-darkman-medium.onnx",
    ),
}

# ── Internal helpers ──────────────────────────────────────────────────────────

_PROGRESS_LOCK = threading.Lock()


def _default_cache_dir(subdir: str) -> Path:
    base = Path(os.environ.get("JARVIS_MODELS_CACHE", "~/.jarvis/models")).expanduser()
    return base / subdir


def _snapshot_with_progress(
    repo_id: str,
    local_dir: Path,
    phase: str,
    on_progress: Optional[Callable[[dict], None]] = None,
    ignore_patterns: Optional[list] = None,
) -> Path | None:
    """
    Download a Hugging Face snapshot, emitting progress updates via
    ``on_progress``.  Returns the local directory path on success, or None.
    """
    try:
        from huggingface_hub import snapshot_download  # type: ignore
    except ImportError:
        logger.warning("huggingface_hub unavailable; model download skipped (%s).", repo_id)
        return None

    local_dir.mkdir(parents=True, exist_ok=True)

    if on_progress:
        on_progress({"phase": phase, "percent": 5, "status": f"Connecting to HuggingFace ({repo_id})…"})

    # Track download progress by polling local directory size vs. expected total.
    # huggingface_hub doesn't expose a per-file callback in older versions, so
    # we use a background polling thread for intermediate progress updates.
    _stop_polling = threading.Event()

    def _poll_progress() -> None:
        if not on_progress:
            return
        last_pct = 5
        while not _stop_polling.wait(timeout=2.0):
            try:
                downloaded = sum(
                    f.stat().st_size
                    for f in local_dir.rglob("*")
                    if f.is_file() and not f.name.endswith(".lock")
                )
                # Estimate based on file sizes already on disk; cap at 95 until done.
                # We can't know total reliably without metadata, so scale 0→95 as
                # downloaded grows. Use 1 GB as soft cap for progress display.
                SOFT_CAP = 1_073_741_824  # 1 GiB
                pct = min(95, max(last_pct, int(downloaded / SOFT_CAP * 90) + 5))
                if pct != last_pct:
                    on_progress({"phase": phase, "percent": pct, "status": f"Downloading {repo_id}… {pct}%"})
                    last_pct = pct
            except Exception:
                pass

    poll_thread = threading.Thread(target=_poll_progress, daemon=True)
    poll_thread.start()

    try:
        snapshot_download(
            repo_id=repo_id,
            local_dir=str(local_dir),
            local_dir_use_symlinks=False,
            ignore_patterns=ignore_patterns or ["*.md", "*.txt", ".gitattributes"],
        )
        _stop_polling.set()
        poll_thread.join(timeout=3)
        if on_progress:
            on_progress({"phase": phase, "percent": 100, "status": f"Model ready: {repo_id}"})
        return local_dir
    except Exception as exc:
        _stop_polling.set()
        poll_thread.join(timeout=3)
        logger.warning("Failed to download HF snapshot (%s): %s", repo_id, exc)
        if on_progress:
            on_progress({"phase": phase, "percent": 0, "error": f"Download failed: {exc}"})
        return None


def _file_with_progress(
    url: str,
    dest: Path,
    phase: str,
    on_progress: Optional[Callable[[dict], None]] = None,
) -> Path | None:
    """Download a single file with chunked progress updates."""
    try:
        import urllib.request
        dest.parent.mkdir(parents=True, exist_ok=True)
        if on_progress:
            on_progress({"phase": phase, "percent": 5, "status": f"Downloading {dest.name}…"})

        MB = 1024 * 1024
        downloaded = 0
        total = 0

        def _reporthook(block_num: int, block_size: int, file_size: int) -> None:
            nonlocal downloaded, total
            total = file_size
            downloaded = block_num * block_size
            if total > 0 and on_progress:
                pct = min(99, int(downloaded / total * 100))
                on_progress({"phase": phase, "percent": pct, "status": f"Downloading {dest.name}… {pct}%"})

        urllib.request.urlretrieve(url, str(dest), reporthook=_reporthook)
        if on_progress:
            on_progress({"phase": phase, "percent": 100, "status": f"Model ready: {dest.name}"})
        return dest
    except Exception as exc:
        logger.warning("Failed to download file (%s): %s", url, exc)
        if on_progress:
            on_progress({"phase": phase, "percent": 0, "error": f"Download failed: {exc}"})
        return None


# ── Public API ────────────────────────────────────────────────────────────────


def ensure_parakeet_model(
    cache_dir: str | None = None,
    on_progress: Optional[Callable[[dict], None]] = None,
) -> Path | None:
    target_dir = Path(
        cache_dir or os.environ.get("JARVIS_PARAKEET_CACHE", "~/.jarvis/models/parakeet")
    ).expanduser()
    # Quick-skip if the model snapshot already exists
    if any(target_dir.glob("*.onnx")):
        return target_dir
    return _snapshot_with_progress(
        DEFAULT_PARAKEET_REPO,
        target_dir,
        phase="downloading_parakeet",
        on_progress=on_progress,
        ignore_patterns=["*.md", "*.txt", ".gitattributes", "*.png", "*.jpg"],
    )


def ensure_whisper_model(
    model_size: str = "base",
    cache_dir: str | None = None,
    on_progress: Optional[Callable[[dict], None]] = None,
) -> Path | None:
    """
    Ensure the faster-whisper model weights for *model_size* are present.
    Supported sizes: tiny | base | small | medium | large

    Emits progress events with ``phase = "downloading_stt"``.
    """
    size = model_size.strip().lower() if model_size else "base"
    repo_id = WHISPER_MODEL_REPOS.get(size)
    if not repo_id:
        logger.warning("Unknown Whisper model size: '%s'. Using 'base'.", size)
        repo_id = WHISPER_MODEL_REPOS["base"]
        size = "base"

    target_dir = Path(
        cache_dir or os.environ.get("JARVIS_WHISPER_CACHE", f"~/.jarvis/models/whisper-{size}")
    ).expanduser()

    # Skip if already downloaded (faster-whisper stores model.bin)
    if (target_dir / "model.bin").exists():
        logger.info("Whisper model '%s' already cached at %s.", size, target_dir)
        if on_progress:
            on_progress({"phase": "downloading_stt", "percent": 100, "status": "STT model already cached."})
        return target_dir

    logger.info("Downloading Whisper model '%s' from HuggingFace…", size)
    return _snapshot_with_progress(
        repo_id,
        target_dir,
        phase="downloading_stt",
        on_progress=on_progress,
        ignore_patterns=["*.md", "*.txt", ".gitattributes"],
    )


def ensure_kokoro_model(
    cache_dir: str | None = None,
    on_progress: Optional[Callable[[dict], None]] = None,
) -> Path | None:
    """
    Ensure the Kokoro-82M TTS model weights are present.

    Emits progress events with ``phase = "downloading_tts"``.
    """
    target_dir = Path(
        cache_dir or os.environ.get("JARVIS_KOKORO_CACHE", "~/.jarvis/models/kokoro")
    ).expanduser()

    # Quick check: kokoro stores model files like kokoro-v0_19.pth
    if any(target_dir.glob("kokoro-*.pth")):
        logger.info("Kokoro TTS model already cached at %s.", target_dir)
        if on_progress:
            on_progress({"phase": "downloading_tts", "percent": 100, "status": "TTS model already cached."})
        return target_dir

    logger.info("Downloading Kokoro-82M TTS model from HuggingFace…")
    return _snapshot_with_progress(
        KOKORO_REPO,
        target_dir,
        phase="downloading_tts",
        on_progress=on_progress,
        ignore_patterns=["*.md", "*.txt", ".gitattributes"],
    )


def ensure_piper_model(
    language: str = "en",
    cache_dir: str | None = None,
    on_progress: Optional[Callable[[dict], None]] = None,
) -> Path | None:
    """
    Ensure the Piper TTS ONNX model for *language* is present.

    Emits progress events with ``phase = "downloading_tts_piper"``.
    """
    lang = str(language or "en").strip().lower()[:2]
    url = PIPER_MODEL_URLS.get(lang)
    if not url:
        logger.warning("No Piper model URL configured for language '%s'.", lang)
        return None

    base_cache = Path(
        cache_dir or os.environ.get("JARVIS_PIPER_CACHE", "~/.jarvis/models/piper")
    ).expanduser()
    filename = url.rsplit("/", 1)[-1]
    dest = base_cache / lang / filename

    if dest.exists():
        logger.info("Piper TTS model (%s) already cached at %s.", lang, dest)
        if on_progress:
            on_progress({"phase": "downloading_tts_piper", "percent": 100, "status": "Piper model already cached."})
        return dest

    logger.info("Downloading Piper TTS model for language '%s'…", lang)
    return _file_with_progress(url, dest, phase="downloading_tts_piper", on_progress=on_progress)


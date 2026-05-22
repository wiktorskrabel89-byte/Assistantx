"""
Model downloader helpers for lazy local voice model setup.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_PARAKEET_REPO = os.environ.get(
    "JARVIS_PARAKEET_HF_REPO",
    "nvidia/parakeet-tdt-0.6b-v3",
)


def ensure_parakeet_model(cache_dir: str | None = None) -> Path | None:
    target_dir = Path(cache_dir or os.environ.get("JARVIS_PARAKEET_CACHE", "~/.jarvis/models/parakeet")).expanduser()
    target_dir.mkdir(parents=True, exist_ok=True)
    try:
        from huggingface_hub import snapshot_download
    except Exception:
        logger.warning("huggingface_hub unavailable; Parakeet model download skipped.")
        return None

    try:
        snapshot_download(
            repo_id=DEFAULT_PARAKEET_REPO,
            local_dir=str(target_dir),
            local_dir_use_symlinks=False,
            ignore_patterns=["*.md", "*.txt", ".gitattributes", "*.png", "*.jpg"],
        )
        return target_dir
    except Exception as exc:
        logger.warning("Failed to download Parakeet model snapshot: %s", exc)
        return None


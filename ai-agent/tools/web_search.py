from __future__ import annotations

import json
import logging
import os
import time
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

SEARXNG_BASE_URL = os.environ.get("JARVIS_SEARXNG_URL", "http://127.0.0.1:8080").rstrip("/")
MAX_LIMIT = 10
DEFAULT_LIMIT = 5
DEFAULT_TIMEOUT_SECONDS = max(3, int(os.environ.get("JARVIS_WEB_SEARCH_TIMEOUT_SECONDS", "8")))
DEFAULT_MAX_RAM_MB = max(256, int(os.environ.get("JARVIS_WEB_SEARCH_MAX_RAM_MB", "1536")))
PLAYWRIGHT_ENABLED = os.environ.get("JARVIS_WEB_SEARCH_USE_PLAYWRIGHT", "false").strip().lower() in {"1", "true", "yes"}


class WebSearchWorker:
    def __init__(self) -> None:
        self._timeout_seconds = DEFAULT_TIMEOUT_SECONDS
        self._max_ram_mb = DEFAULT_MAX_RAM_MB
        self._playwright_enabled = PLAYWRIGHT_ENABLED
        self._last_started_at = 0.0

    def _rss_mb(self) -> int | None:
        try:
            import psutil
            return int(psutil.Process().memory_info().rss / 1024 / 1024)
        except Exception:
            return None

    def _memory_ok(self) -> bool:
        rss = self._rss_mb()
        if rss is None:
            return True
        return rss < self._max_ram_mb

    def _searx_query(self, query: str, limit: int) -> list[dict]:
        url = f"{SEARXNG_BASE_URL}/search?q={quote_plus(query)}&format=json"
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "AssistantX-Sidecar/1.0"})
        with urlopen(request, timeout=self._timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        results = []
        for item in payload.get("results", [])[:limit]:
            results.append({
                "title": str(item.get("title", "")).strip(),
                "url": str(item.get("url", "")).strip(),
                "snippet": str(item.get("content", "")).strip(),
                "engine": str(item.get("engine", "")).strip(),
            })
        return results

    def _render_preview(self, url: str) -> str:
        if not self._playwright_enabled:
            return ""
        if not url:
            return ""
        if not self._memory_ok():
            return ""
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(url, timeout=self._timeout_seconds * 1000, wait_until="domcontentloaded")
                text = page.evaluate("() => document.body ? document.body.innerText : ''")
                browser.close()
            value = str(text or "").replace("\n", " ").strip()
            return value[:600]
        except Exception as exc:
            logger.debug("Playwright render failed for %s: %s", url, exc)
            return ""

    def search(self, query: str, limit: int = DEFAULT_LIMIT) -> list[dict]:
        q = str(query or "").strip()
        if not q:
            return []
        if not self._memory_ok():
            logger.warning("Web search worker skipped due to memory guard (rss >= %sMB).", self._max_ram_mb)
            return []

        bounded = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
        started = time.perf_counter()
        try:
            results = self._searx_query(q, bounded)
            if self._playwright_enabled:
                for item in results[: min(3, len(results))]:
                    preview = self._render_preview(str(item.get("url", "")))
                    if preview:
                        item["renderedText"] = preview
            return results
        except Exception as exc:
            logger.warning("SearXNG search failed: %s", exc)
            return []
        finally:
            self._last_started_at = time.time()
            latency_ms = (time.perf_counter() - started) * 1000
            logger.debug("Web search worker latency_ms=%.2f", latency_ms)


_worker = WebSearchWorker()


def search_web(query: str, limit: int = 5) -> list[dict]:
    return _worker.search(query, limit)

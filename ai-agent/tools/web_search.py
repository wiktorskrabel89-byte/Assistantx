from __future__ import annotations

import json
import logging
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

SEARXNG_BASE_URL = "http://127.0.0.1:8888"


def search_web(query: str, limit: int = 5) -> list[dict]:
    q = str(query or "").strip()
    if not q:
        return []
    url = f"{SEARXNG_BASE_URL}/search?q={quote_plus(q)}&format=json"
    try:
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "AssistantX-Sidecar/1.0"})
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        results = []
        for item in payload.get("results", [])[: max(1, min(limit, 10))]:
            results.append({
                "title": str(item.get("title", "")).strip(),
                "url": str(item.get("url", "")).strip(),
                "snippet": str(item.get("content", "")).strip(),
                "engine": str(item.get("engine", "")).strip(),
            })
        return results
    except Exception as exc:
        logger.warning("SearXNG search failed: %s", exc)
        return []


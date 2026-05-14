"""
spaCy-based intent parser for desktop launcher commands.

Falls back to a lightweight regex classifier when spaCy is not installed,
so the sidecar can still route commands without the full NLP stack.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Default spaCy model — override with JARVIS_SPACY_MODEL env var.
SPACY_MODEL = os.environ.get("JARVIS_SPACY_MODEL", "en_core_web_sm")

# ── Lightweight fallback patterns (no spaCy required) ────────────────────────
# Each tuple: (regex, intent, entity_fn)
_FALLBACK_PATTERNS: list[tuple] = [
    (
        re.compile(r"(?:open|launch|start|run)\s+(.+)", re.I),
        "open_app",
        lambda m: {"app": m.group(1).strip()},
    ),
    (
        re.compile(r"(?:close|quit|kill|stop)\s+(.+)", re.I),
        "close_app",
        lambda m: {"app": m.group(1).strip()},
    ),
    (
        re.compile(r"(?:search|find|google|look up)\s+(.+?)(?:\s+on\s+youtube)?$", re.I),
        "search_web",
        lambda m: {"query": m.group(1).strip()},
    ),
    (
        re.compile(r"(?:youtube|search youtube for)\s+(.+)", re.I),
        "search_youtube",
        lambda m: {"query": m.group(1).strip()},
    ),
    (
        re.compile(r"(?:play|music|play music)", re.I),
        "open_app",
        lambda _m: {"app": "spotify"},
    ),
    (
        re.compile(r"(?:volume up|louder|increase volume)", re.I),
        "volume_up",
        lambda _m: {},
    ),
    (
        re.compile(r"(?:volume down|quieter|decrease volume|lower volume)", re.I),
        "volume_down",
        lambda _m: {},
    ),
    (
        re.compile(r"(?:mute|unmute|silence)", re.I),
        "mute",
        lambda _m: {},
    ),
    (
        re.compile(r"(?:screenshot|capture screen|take screenshot)", re.I),
        "screenshot",
        lambda _m: {},
    ),
    (
        re.compile(r"(?:shutdown|turn off|shut down)\s*(?:in\s+(\d+)\s+minutes?)?", re.I),
        "shutdown",
        lambda m: {"delay_minutes": int(m.group(1) or 0)},
    ),
    (
        re.compile(r"(?:restart|reboot)\s*(?:in\s+(\d+)\s+minutes?)?", re.I),
        "restart",
        lambda m: {"delay_minutes": int(m.group(1) or 0)},
    ),
    (
        re.compile(r"(?:sleep|hibernate|standby)", re.I),
        "sleep",
        lambda _m: {},
    ),
    (
        re.compile(r"(?:lock|lock screen|lock computer|lock pc)", re.I),
        "lock_screen",
        lambda _m: {},
    ),
    (
        re.compile(r"(?:gaming mode|start gaming|game mode)", re.I),
        "start_mode",
        lambda _m: {"mode": "gaming"},
    ),
    (
        re.compile(r"(?:study mode|focus mode|start studying)", re.I),
        "start_mode",
        lambda _m: {"mode": "study"},
    ),
    (
        re.compile(r"(?:stream mode|start streaming)", re.I),
        "start_mode",
        lambda _m: {"mode": "stream"},
    ),
]

# ── spaCy-based NER + rule classification ────────────────────────────────────
_OPEN_VERBS = {"open", "launch", "start", "run", "boot"}
_CLOSE_VERBS = {"close", "quit", "kill", "stop", "exit", "terminate"}


class IntentParser:
    """
    Two-tier intent classifier:
    1. spaCy NLP with dependency parsing (when available)
    2. Regex-based fallback (always available)
    """

    def __init__(self, model: Optional[str] = None) -> None:
        self._nlp = None
        self._spacy_available = False
        self._load_spacy(model or SPACY_MODEL)

    def _load_spacy(self, model: str) -> None:
        try:
            import spacy
            self._nlp = spacy.load(model)
            self._spacy_available = True
            logger.info("spaCy model '%s' loaded.", model)
        except ImportError:
            logger.warning(
                "spaCy is not installed. Using regex intent fallback. "
                "Install it with: pip install spacy && python -m spacy download en_core_web_sm"
            )
        except OSError:
            logger.warning(
                "spaCy model '%s' not found. Using regex intent fallback. "
                "Download it with: python -m spacy download en_core_web_sm",
                model,
            )
        except Exception as exc:
            logger.warning("spaCy model load error: %s. Using regex fallback.", exc)

    @property
    def spacy_available(self) -> bool:
        return self._spacy_available

    # ── spaCy parsing ────────────────────────────────────────────────────────
    def _parse_with_spacy(self, text: str) -> Optional[dict]:
        doc = self._nlp(text.lower())

        for token in doc:
            if token.pos_ == "VERB":
                lemma = token.lemma_
                children = {child.dep_: child for child in token.children}
                obj_token = children.get("dobj") or children.get("pobj")

                if lemma in _OPEN_VERBS and obj_token:
                    app_text = " ".join(
                        t.text for t in obj_token.subtree
                        if not t.is_stop or t.ent_type_
                    ).strip()
                    return {
                        "intent": "open_app",
                        "entities": {"app": app_text or obj_token.text},
                        "confidence": 0.9,
                    }

                if lemma in _CLOSE_VERBS and obj_token:
                    app_text = " ".join(t.text for t in obj_token.subtree).strip()
                    return {
                        "intent": "close_app",
                        "entities": {"app": app_text or obj_token.text},
                        "confidence": 0.9,
                    }

        return None

    # ── Regex fallback ───────────────────────────────────────────────────────
    def _parse_with_regex(self, text: str) -> dict:
        for pattern, intent, entity_fn in _FALLBACK_PATTERNS:
            m = pattern.search(text)
            if m:
                return {
                    "intent": intent,
                    "entities": entity_fn(m),
                    "confidence": 0.75,
                }
        return {"intent": "unknown", "entities": {}, "confidence": 0.0}

    # ── Public API ───────────────────────────────────────────────────────────
    def parse(self, text: str) -> dict:
        """
        Parse text and return:
          { "intent": str, "entities": dict, "confidence": float }

        This is a blocking call — run it in an executor.
        """
        text = str(text or "").strip()
        if not text:
            return {"intent": "unknown", "entities": {}, "confidence": 0.0}

        if self._spacy_available and self._nlp is not None:
            result = self._parse_with_spacy(text)
            if result:
                return result

        return self._parse_with_regex(text)

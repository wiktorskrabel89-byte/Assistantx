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

SPACY_MODEL = os.environ.get("JARVIS_SPACY_MODEL", "en_core_web_sm")
_ADMIN_SUFFIX_RE = re.compile(r"\s+as\s+admin(?:istrator)?$", re.I)
_LAUNCHER_HINTS = {
    "editor": "editor",
    "code editor": "editor",
    "music": "music",
    "browser": "browser",
    "terminal": "terminal",
}

try:
    from rapidfuzz import process as rapidfuzz_process
except Exception:  # pragma: no cover - optional dependency
    rapidfuzz_process = None


def _launcher_entities(raw_target: str, transcript: str) -> dict:
    target = str(raw_target or "").strip()
    admin = False
    if _ADMIN_SUFFIX_RE.search(target):
        admin = True
        target = _ADMIN_SUFFIX_RE.sub("", target).strip()
    if target.lower().startswith("my "):
        target = target[3:].strip()

    normalized_target = target.lower()
    if rapidfuzz_process and normalized_target:
        match = rapidfuzz_process.extractOne(normalized_target, list(_LAUNCHER_HINTS.keys()), score_cutoff=85)
        if match:
            normalized_target = _LAUNCHER_HINTS.get(match[0], target)

    return {
        "app": normalized_target or target,
        "admin": admin,
        "qualifiers": {"admin": admin},
        "transcript": transcript,
    }


_FALLBACK_PATTERNS: list[tuple] = [
    (
        re.compile(r"(?:open|launch|start|run)\s+(.+)", re.I),
        "open_app",
        lambda m, text: _launcher_entities(m.group(1), text),
    ),
    (
        re.compile(r"(?:close|quit|stop|terminate)\s+(.+)", re.I),
        "close_app",
        lambda m, text: {"app": m.group(1).strip(), "transcript": text},
    ),
    (
        re.compile(r"(?:search|find|google|look up)\s+(.+?)(?:\s+on\s+youtube)?$", re.I),
        "search_web",
        lambda m, text: {"query": m.group(1).strip(), "transcript": text},
    ),
    (
        re.compile(r"(?:youtube|search youtube for)\s+(.+)", re.I),
        "search_youtube",
        lambda m, text: {"query": m.group(1).strip(), "transcript": text},
    ),
    (
        re.compile(
            r"(?:remind me|set reminder|create reminder|przypomnij mi|ustaw przypomnienie)\s+(.+)",
            re.I,
        ),
        "add_reminder",
        lambda m, text: {
            "reminder_text": m.group(1).strip(),
            "time_phrase": m.group(1).strip(),
            "transcript": text,
        },
    ),
    (
        re.compile(
            r"(?:in\s+\d+\s+(?:hours?|minutes?)|tonight|tomorrow(?: morning)?|next\s+\w+|this weekend|jutro|wieczorem|rano|nast[eę]pny\s+\w+)",
            re.I,
        ),
        "add_reminder",
        lambda m, text: {
            "reminder_text": text.strip(),
            "time_phrase": m.group(0).strip(),
            "transcript": text,
        },
    ),
    (
        re.compile(r"(?:play|music|play music)", re.I),
        "open_app",
        lambda _m, text: _launcher_entities("music", text),
    ),
    (
        re.compile(r"(?:volume up|louder|increase volume)", re.I),
        "volume_up",
        lambda _m, text: {"transcript": text},
    ),
    (
        re.compile(r"(?:volume down|quieter|decrease volume|lower volume)", re.I),
        "volume_down",
        lambda _m, text: {"transcript": text},
    ),
    (
        re.compile(r"(?:mute|unmute|silence)", re.I),
        "mute",
        lambda _m, text: {"transcript": text},
    ),
    (
        re.compile(r"(?:screenshot|capture screen|take screenshot)", re.I),
        "screenshot",
        lambda _m, text: {"transcript": text},
    ),
    (
        re.compile(r"(?:shutdown|turn off|shut down)\s*(?:in\s+(\d+)\s+minutes?)?", re.I),
        "shutdown",
        lambda m, text: {"delay_minutes": int(m.group(1) or 0), "transcript": text},
    ),
    (
        re.compile(r"(?:restart|reboot)\s*(?:in\s+(\d+)\s+minutes?)?", re.I),
        "restart",
        lambda m, text: {"delay_minutes": int(m.group(1) or 0), "transcript": text},
    ),
    (
        re.compile(r"(?:sleep|hibernate|standby)", re.I),
        "sleep",
        lambda _m, text: {"transcript": text},
    ),
    (
        re.compile(r"(?:lock|lock screen|lock computer|lock pc)", re.I),
        "lock_screen",
        lambda _m, text: {"transcript": text},
    ),
    (
        re.compile(r"(?:gaming mode|start gaming|game mode)", re.I),
        "start_mode",
        lambda _m, text: {"mode": "gaming", "transcript": text},
    ),
    (
        re.compile(r"(?:study mode|focus mode|start studying)", re.I),
        "start_mode",
        lambda _m, text: {"mode": "study", "transcript": text},
    ),
    (
        re.compile(r"(?:stream mode|start streaming)", re.I),
        "start_mode",
        lambda _m, text: {"mode": "stream", "transcript": text},
    ),
]

_OPEN_VERBS = {"open", "launch", "start", "run", "boot"}
_CLOSE_VERBS = {"close", "quit", "stop", "exit", "terminate"}


class IntentParser:
    def __init__(self, model: Optional[str] = None) -> None:
        self._nlp = None
        self._spacy_available = False
        self._load_spacy(model or SPACY_MODEL)

    def _load_spacy(self, model: str) -> None:
        try:
            import spacy
            self._nlp = spacy.load(model)
            self._spacy_available = True
            logger.info("spaCy model %s loaded.", model)
        except ImportError:
            logger.warning(
                "spaCy is not installed. Using regex intent fallback. "
                "Install it with: pip install spacy && python -m spacy download en_core_web_sm"
            )
        except OSError:
            logger.warning(
                "spaCy model %s not found. Using regex intent fallback. "
                "Download it with: python -m spacy download en_core_web_sm",
                model,
            )
        except Exception as exc:
            logger.warning("spaCy model load error: %s. Using regex fallback.", exc)

    @property
    def spacy_available(self) -> bool:
        return self._spacy_available

    def _wrap_result(self, intent: str, entities: dict, confidence: float) -> dict:
        action = intent.replace("_app", "") if intent.endswith("_app") else intent
        intent_kind = "launcher" if intent in {"open_app", "close_app", "search_web", "search_youtube"} else "system"
        return {
            "intent": intent,
            "action": action,
            "intent_kind": intent_kind,
            "entities": entities,
            "confidence": confidence,
        }

    def _parse_with_spacy(self, text: str) -> Optional[dict]:
        doc = self._nlp(text.lower())
        for token in doc:
            if token.pos_ != "VERB":
                continue
            lemma = token.lemma_
            children = {child.dep_: child for child in token.children}
            obj_token = children.get("dobj") or children.get("pobj")
            if lemma in _OPEN_VERBS and obj_token:
                app_text = " ".join(
                    t.text for t in obj_token.subtree if not t.is_stop or t.ent_type_
                ).strip()
                return self._wrap_result(
                    "open_app",
                    _launcher_entities(app_text or obj_token.text, text),
                    0.9,
                )
            if lemma in _CLOSE_VERBS and obj_token:
                app_text = " ".join(t.text for t in obj_token.subtree).strip()
                return self._wrap_result(
                    "close_app",
                    {"app": app_text or obj_token.text, "transcript": text},
                    0.9,
                )
        return None

    def _parse_with_regex(self, text: str) -> dict:
        for pattern, intent, entity_fn in _FALLBACK_PATTERNS:
            match = pattern.search(text)
            if match:
                return self._wrap_result(intent, entity_fn(match, text), 0.75)
        return self._wrap_result("unknown", {"transcript": text}, 0.0)

    def parse(self, text: str) -> dict:
        text = str(text or "").strip()
        if not text:
            return self._wrap_result("unknown", {"transcript": ""}, 0.0)
        if self._spacy_available and self._nlp is not None:
            result = self._parse_with_spacy(text)
            if result:
                return result
        return self._parse_with_regex(text)

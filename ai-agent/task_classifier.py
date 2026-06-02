"""
Task Classifier Agent for Jarvis — Intelligent request routing (Path A vs Path B).

Analyzes user prompts and attached images to determine optimal execution strategy:
  - Path A: Vision-only (fast path for analysis, explanation)
  - Path B: Vision → Coder relay (when code generation needed)
  - Path C: Text-only (no image, lightweight processing)

Handles model hot-swap via llama.cpp API with session state tracking.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)

_CONFIDENCE_AMBIGUOUS_THRESHOLD = 0.70  # below this → ask user to confirm


class ExecutionPath(Enum):
    """Request execution strategy."""
    PATH_A = "vision_only"          # Quick: Vision model only
    PATH_B = "vision_to_coder"      # Full relay: Vision + Coder
    PATH_C = "text_only"            # No image: text model or cloud
    UNKNOWN = "unknown"


@dataclass
class ClassificationResult:
    """Result of task classification."""
    path: ExecutionPath
    needs_vision: bool
    needs_coder: bool
    confidence: float
    reasoning: str
    # Set when confidence < _CONFIDENCE_AMBIGUOUS_THRESHOLD so callers can prompt user
    needs_confirmation: bool = False
    # Coder model prompt prefix built from vision model output (Path B relay)
    vision_context_prefix: str = ""

    def to_dict(self):
        return {
            "path": self.path.value,
            "needs_vision": self.needs_vision,
            "needs_coder": self.needs_coder,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "needs_confirmation": self.needs_confirmation,
            "vision_context_prefix": self.vision_context_prefix,
        }


class TaskClassifier:
    """Intelligent router for Jarvis task execution."""

    # Keywords that indicate code generation needs
    CODE_KEYWORDS = {
        "write", "generate", "code", "script", "function", "class", "module",
        "refactor", "fix", "debug", "implement", "create", "build", "design",
        "component", "develop", "program", "coding", "react", "html",
        "css", "javascript", "python", "typescript", "rust", "go", "java",
    }

    @staticmethod
    def classify(
        prompt: str,
        has_image: bool,
        image_description: Optional[str] = None,
        session_context: Optional[dict] = None,
    ) -> ClassificationResult:
        """Classify a user request and determine optimal execution path."""
        prompt_lower = prompt.lower().strip()

        # Session bias: if the last 2 turns used a coder, lean toward coder
        # even for follow-up prompts that lack explicit code keywords.
        session_code_bias = False
        if session_context:
            recent = session_context.get("recent_paths", [])
            if recent and sum(1 for p in recent[-2:] if "coder" in p) >= 1:
                session_code_bias = True

        # Path C: Text-only (no image)
        if not has_image:
            needs_code = TaskClassifier._detect_code_intent(prompt_lower) or session_code_bias
            path = ExecutionPath.PATH_B if needs_code else ExecutionPath.PATH_C
            # Lower confidence when the bias came purely from session history
            if needs_code and session_code_bias and not TaskClassifier._detect_code_intent(prompt_lower):
                confidence = 0.65
            else:
                confidence = 0.85 if needs_code else 0.90
            reasoning = (
                "Text-only request " +
                ("with code generation intent" if needs_code else "for discussion/analysis") +
                (" (session continuation bias)" if session_code_bias and needs_code else "")
            )
            result = ClassificationResult(
                path=path,
                needs_vision=False,
                needs_coder=needs_code,
                confidence=confidence,
                reasoning=reasoning,
            )
            result.needs_confirmation = confidence < _CONFIDENCE_AMBIGUOUS_THRESHOLD
            return result

        # Has image: determine if code generation needed
        needs_code = TaskClassifier._detect_code_intent(prompt_lower) or session_code_bias

        # Build vision context prefix for Path B relay (improvement #5)
        vision_context = ""
        if image_description and image_description.strip():
            vision_context = (
                f"[Vision model analysis of the attached image]\n{image_description.strip()}\n\n"
                f"[User request based on the above image]\n"
            )

        # Path B: Image + code generation (Vision → Coder relay)
        if needs_code:
            confidence = 0.95
            result = ClassificationResult(
                path=ExecutionPath.PATH_B,
                needs_vision=True,
                needs_coder=True,
                confidence=confidence,
                reasoning="Image present with code generation intent — using Vision→Coder relay",
                vision_context_prefix=vision_context,
            )
            result.needs_confirmation = confidence < _CONFIDENCE_AMBIGUOUS_THRESHOLD
            return result

        # Path A: Image analysis only (Vision model)
        confidence = 0.92
        result = ClassificationResult(
            path=ExecutionPath.PATH_A,
            needs_vision=True,
            needs_coder=False,
            confidence=confidence,
            reasoning="Image present, code not needed — Vision-only path",
        )
        result.needs_confirmation = confidence < _CONFIDENCE_AMBIGUOUS_THRESHOLD
        return result

    @staticmethod
    def _detect_code_intent(prompt_lower: str) -> bool:
        """Detect if prompt intends code generation."""
        # Direct code keyword match
        code_pattern = r"\b(" + "|".join(TaskClassifier.CODE_KEYWORDS) + r")\b"
        if re.search(code_pattern, prompt_lower):
            return True

        # Patterns like "make X component", "create a Y function"
        if re.search(r"(make|create|build|write|generate)\s+(?:a\s+)?(component|function|script|page|app|website)", prompt_lower):
            return True

        # Code file references
        if re.search(r"\.(js|jsx|ts|tsx|py|rs|go|java|cpp|c|html|css|json|yaml|xml)(?:\s|$)", prompt_lower):
            return True

        return False

    @staticmethod
    def get_model_requirements(classification: ClassificationResult) -> dict:
        """Get model loading requirements based on classification."""
        return {
            "vision_model": {
                "enabled": classification.needs_vision,
                "size_gb": 4.0,  # Gemma-2 2B or PaliGemma-2 4B (Q4_K_M)
                "alternatives": [
                    ("qwen2.5-vl-7b", 5.5),
                    ("llama3.2-vision-11b", 8.0),
                ],
            },
            "coder_model": {
                "enabled": classification.needs_coder,
                "size_gb": 18.0,  # Qwen3-Coder-Next 32B (Q4_K_M)
                "alternatives": [
                    ("deepseek-coder-v3-distilled", 12.0),
                    ("qwen3-8b", 5.0),
                    ("phi-4", 8.5),
                    ("codestral-25.12", 15.0),
                ],
            },
        }


_SESSION_TTL_SECONDS = 3600  # evict sessions idle for 1 hour
_MAX_SESSIONS = 500


@dataclass
class SessionState:
    """Track multi-turn conversation state and model lifecycle."""
    session_id: str
    history: list = field(default_factory=list)
    current_models_loaded: set = field(default_factory=set)
    model_load_time: dict = field(default_factory=dict)
    error_count: int = 0
    last_classification: Optional[ClassificationResult] = None
    last_active: float = field(default_factory=time.monotonic)

    def add_turn(
        self,
        user_prompt: str,
        classification: ClassificationResult,
        response: str,
    ) -> None:
        """Record a turn in the conversation."""
        self.history.append({
            "user": user_prompt,
            "classification": classification.to_dict(),
            "response": response,
        })
        self.last_classification = classification
        self.last_active = time.monotonic()

    def to_session_context(self) -> dict:
        """Build the session_context dict consumed by TaskClassifier.classify()."""
        recent_paths = [
            t["classification"]["path"]
            for t in self.history[-5:]
        ]
        return {"recent_paths": recent_paths}

    def should_unload_vision(self) -> bool:
        if not self.history:
            return False
        if self.last_classification and not self.last_classification.needs_vision:
            return "vision" in self.current_models_loaded
        return False

    def should_unload_coder(self) -> bool:
        if not self.history:
            return False
        if self.last_classification and not self.last_classification.needs_coder:
            return "coder" in self.current_models_loaded
        return False


# Global session storage
_sessions: dict[str, SessionState] = {}


def _evict_stale_sessions() -> None:
    """Remove sessions idle longer than TTL; cap total count."""
    now = time.monotonic()
    stale = [sid for sid, s in _sessions.items() if now - s.last_active > _SESSION_TTL_SECONDS]
    for sid in stale:
        del _sessions[sid]
    if len(_sessions) > _MAX_SESSIONS:
        by_age = sorted(_sessions.items(), key=lambda kv: kv[1].last_active)
        for sid, _ in by_age[: len(_sessions) - _MAX_SESSIONS]:
            del _sessions[sid]


def get_or_create_session(session_id: str) -> SessionState:
    """Get or create a session with state tracking."""
    _evict_stale_sessions()
    if session_id not in _sessions:
        _sessions[session_id] = SessionState(session_id=session_id)
    return _sessions[session_id]


def classify_request(
    prompt: str,
    has_image: bool = False,
    image_description: Optional[str] = None,
    session_id: Optional[str] = None,
) -> ClassificationResult:
    """
    Main entry point: classify a user request and return execution strategy.

    Used by the router to determine whether to use Vision, Coder, or cloud.
    image_description is the text output of the vision model for Path B relay.
    """
    session: Optional[SessionState] = None
    session_context: Optional[dict] = None

    if session_id:
        session = get_or_create_session(session_id)
        session_context = session.to_session_context()

    result = TaskClassifier.classify(
        prompt=prompt,
        has_image=has_image,
        image_description=image_description,
        session_context=session_context,
    )

    if session:
        session.last_classification = result
        session.last_active = time.monotonic()

    logger.info(
        "Task classified: path=%s, vision=%s, coder=%s, conf=%.2f, confirm=%s",
        result.path.value, result.needs_vision, result.needs_coder,
        result.confidence, result.needs_confirmation,
    )

    return result

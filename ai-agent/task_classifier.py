"""
Task Classifier Agent for Jarvis — Intelligent request routing (Path A vs Path B).

Analyzes user prompts and attached images to determine optimal execution strategy:
  - Path A: Vision-only (fast path for analysis, explanation)
  - Path B: Vision → Coder relay (when code generation needed)
  - Path C: Text-only (no image, lightweight processing)

Handles model hot-swap via llama.cpp API with session state tracking.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


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

    def to_dict(self):
        return {
            "path": self.path.value,
            "needs_vision": self.needs_vision,
            "needs_coder": self.needs_coder,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
        }


class TaskClassifier:
    """Intelligent router for Jarvis task execution."""

    # Keywords that indicate code generation needs
    CODE_KEYWORDS = {
        "write", "generate", "code", "script", "function", "class", "module",
        "refactor", "fix", "debug", "implement", "create", "build", "design",
        "component", "build", "develop", "program", "coding", "react", "html",
        "css", "javascript", "python", "typescript", "rust", "go", "java",
    }

    # Keywords indicating visual analysis without code
    VISION_ONLY_KEYWORDS = {
        "analyze", "describe", "explain", "what is", "identify", "recognize",
        "read", "extract", "ocr", "translate", "summarize", "understand",
        "diagram", "chart", "graph", "layout", "design review",
    }

    @staticmethod
    async def classify(
        prompt: str,
        has_image: bool,
        image_description: Optional[str] = None,
        session_context: Optional[dict] = None,
    ) -> ClassificationResult:
        """
        Classify a user request and determine optimal execution path.

        Args:
            prompt: User's text prompt
            has_image: Whether an image is attached
            image_description: Pre-analyzed image description (if available)
            session_context: Session state for multi-turn context

        Returns:
            ClassificationResult with execution strategy
        """
        prompt_lower = prompt.lower().strip()

        # Path C: Text-only (no image)
        if not has_image:
            needs_code = TaskClassifier._detect_code_intent(prompt_lower)
            path = ExecutionPath.PATH_B if needs_code else ExecutionPath.PATH_C
            confidence = 0.85 if needs_code else 0.90
            reasoning = (
                "Text-only request " +
                ("with code generation intent" if needs_code else "for discussion/analysis")
            )
            return ClassificationResult(
                path=path,
                needs_vision=False,
                needs_coder=needs_code,
                confidence=confidence,
                reasoning=reasoning,
            )

        # Has image: determine if code generation needed
        needs_code = TaskClassifier._detect_code_intent(prompt_lower)

        # Path B: Image + code generation (Vision → Coder relay)
        if needs_code:
            return ClassificationResult(
                path=ExecutionPath.PATH_B,
                needs_vision=True,
                needs_coder=True,
                confidence=0.95,
                reasoning="Image present with code generation intent — using Vision→Coder relay",
            )

        # Path A: Image analysis only (Vision model)
        return ClassificationResult(
            path=ExecutionPath.PATH_A,
            needs_vision=True,
            needs_coder=False,
            confidence=0.92,
            reasoning="Image present, code not needed — Vision-only path",
        )

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
    async def get_model_requirements(classification: ClassificationResult) -> dict:
        """Get model loading requirements based on classification."""
        return {
            "vision_model": {
                "enabled": classification.needs_vision,
                "size_gb": 4.0,  # Gemma-2 2B or PaliGemma-2 4B (Q4_K_M)
                "alternatives": [
                    ("qwen2.5-vl-7b", 5.5),   # Fallback for medium hardware
                    ("llama3.2-vision-11b", 8.0),  # For powerful hardware
                ],
            },
            "coder_model": {
                "enabled": classification.needs_coder,
                "size_gb": 5.0,  # Qwen3 8B (Q4_K_M)
                "alternatives": [
                    ("qwen3-coder-next", 15.0),    # Better quality
                    ("deepseek-coder-v3-distilled", 12.0),  # Speed focused
                ],
            },
        }


class SessionState:
    """Track multi-turn conversation state and model lifecycle."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history = []
        self.current_models_loaded = set()  # {'vision', 'coder'} or subsets
        self.model_load_time = {}  # timestamp when each model was loaded
        self.error_count = 0
        self.last_classification = None

    def add_turn(
        self,
        user_prompt: str,
        classification: ClassificationResult,
        response: str,
    ):
        """Record a turn in the conversation."""
        self.history.append({
            "user": user_prompt,
            "classification": classification.to_dict(),
            "response": response,
        })
        self.last_classification = classification

    def should_unload_vision(self) -> bool:
        """Heuristic: unload vision model if next path doesn't need it."""
        if not self.history:
            return False
        if self.last_classification and not self.last_classification.needs_vision:
            return "vision" in self.current_models_loaded
        return False

    def should_unload_coder(self) -> bool:
        """Heuristic: unload coder if next path doesn't need it."""
        if not self.history:
            return False
        if self.last_classification and not self.last_classification.needs_coder:
            return "coder" in self.current_models_loaded
        return False


# Global session storage
_sessions: dict[str, SessionState] = {}


async def get_or_create_session(session_id: str) -> SessionState:
    """Get or create a session with state tracking."""
    if session_id not in _sessions:
        _sessions[session_id] = SessionState(session_id)
    return _sessions[session_id]


async def classify_request(
    prompt: str,
    has_image: bool = False,
    session_id: Optional[str] = None,
) -> ClassificationResult:
    """
    Main entry point: classify a user request and return execution strategy.

    Used by the router to determine whether to use Vision, Coder, or cloud.
    """
    result = await TaskClassifier.classify(
        prompt=prompt,
        has_image=has_image,
        session_context=None,  # TODO: integrate session context
    )

    if session_id:
        session = await get_or_create_session(session_id)
        session.last_classification = result

    logger.info(
        f"Task classified: path={result.path.value}, "
        f"vision={result.needs_vision}, coder={result.needs_coder}, "
        f"conf={result.confidence:.2f}"
    )

    return result

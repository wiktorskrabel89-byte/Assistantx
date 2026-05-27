from __future__ import annotations

import logging
import time
from typing import Any, Callable

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "2026-05-27"
ENTRYPOINT_NAME = "jarvis_executor"

ERROR_UNKNOWN_ACTION = "unknown_action"
ERROR_INVALID_PARAMS = "invalid_params"
ERROR_PERMISSION_DENIED = "permission_denied"
ERROR_EXECUTION_FAILED = "execution_failed"


class ActionError(RuntimeError):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


def _coerce_string(value: Any) -> str:
    return str(value or "").strip()


def _validate_web_search(params: dict[str, Any]) -> dict[str, Any]:
    query = _coerce_string(params.get("query"))
    if not query:
        raise ActionError(ERROR_INVALID_PARAMS, "query is required", {"field": "query"})
    limit_raw = params.get("limit", 5)
    try:
        limit = int(limit_raw)
    except (TypeError, ValueError) as exc:
        raise ActionError(ERROR_INVALID_PARAMS, "limit must be an integer", {"field": "limit"}) from exc
    return {
        "query": query,
        "limit": max(1, min(limit, 10)),
    }


Handler = Callable[[dict[str, Any]], Any]


def _web_search_meta() -> dict[str, Any]:
    return {
        "aliases": {"web_search"},
        "permission": "sidecar:web_search",
        "risk_tier": "low",
        "validate": _validate_web_search,
    }


ACTION_REGISTRY: dict[str, dict[str, Any]] = {
    "web_search": _web_search_meta(),
}

ALIAS_TO_ACTION = {
    alias: action_type
    for action_type, meta in ACTION_REGISTRY.items()
    for alias in meta.get("aliases", {action_type})
}


def normalize_action_payload(message: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(message, dict):
        raise ActionError(ERROR_INVALID_PARAMS, "tool_call payload must be an object")

    action = message.get("action")
    if isinstance(action, dict):
        tool_name = _coerce_string(message.get("tool"))
        if tool_name and tool_name != ENTRYPOINT_NAME:
            raise ActionError(
                ERROR_INVALID_PARAMS,
                f"tool must be {ENTRYPOINT_NAME}",
                {"field": "tool"},
            )
        action_type = _coerce_string(action.get("action_type"))
        params = action.get("params")
        normalized: dict[str, Any] = {
            "schema_version": _coerce_string(action.get("schema_version")) or SCHEMA_VERSION,
            "action_type": action_type,
            "params": params if isinstance(params, dict) else {},
            "request_id": _coerce_string(action.get("request_id") or message.get("requestId")),
            "source": _coerce_string(action.get("source") or message.get("source")),
            "origin": _coerce_string(action.get("origin") or message.get("origin")),
            "dry_run": bool(action.get("dry_run", False)),
        }
    else:
        tool_name = _coerce_string(message.get("tool"))
        legacy_query = message.get("query")
        legacy_params = message.get("params")
        normalized = {
            "schema_version": SCHEMA_VERSION,
            "action_type": tool_name,
            "params": legacy_params if isinstance(legacy_params, dict) else {},
            "request_id": _coerce_string(message.get("requestId")),
            "source": _coerce_string(message.get("source")),
            "origin": _coerce_string(message.get("origin")),
            "dry_run": bool(message.get("dry_run", False)),
        }
        if not normalized["params"] and legacy_query is not None:
            normalized["params"] = {"query": legacy_query}

    if normalized["schema_version"] != SCHEMA_VERSION:
        raise ActionError(
            ERROR_INVALID_PARAMS,
            f"unsupported schema_version: {normalized['schema_version']}",
            {"field": "schema_version"},
        )

    action_type = ALIAS_TO_ACTION.get(normalized["action_type"], normalized["action_type"])
    if not action_type:
        raise ActionError(ERROR_INVALID_PARAMS, "action_type is required", {"field": "action_type"})
    meta = ACTION_REGISTRY.get(action_type)
    if not meta:
        raise ActionError(ERROR_UNKNOWN_ACTION, f"Unsupported action: {normalized['action_type']}", {"action_type": normalized["action_type"]})
    validator = meta.get("validate")
    params = normalized["params"] if isinstance(normalized["params"], dict) else {}
    normalized["action_type"] = action_type
    normalized["params"] = validator(params) if callable(validator) else params
    normalized["permission"] = meta.get("permission")
    normalized["risk_tier"] = meta.get("risk_tier", "low")
    return normalized


def format_action_error(error: Exception, *, action_type: str = "", request_id: str = "") -> dict[str, Any]:
    if isinstance(error, ActionError):
        return {
            "ok": False,
            "error": {
                "code": error.code,
                "message": str(error),
                "details": error.details,
            },
            "action_type": action_type,
            "request_id": request_id,
        }
    return {
        "ok": False,
        "error": {
            "code": ERROR_EXECUTION_FAILED,
            "message": str(error) or "Action execution failed",
            "details": {},
        },
        "action_type": action_type,
        "request_id": request_id,
    }


async def dispatch_action(
    payload: dict[str, Any],
    handlers: dict[str, Handler],
) -> dict[str, Any]:
    normalized = normalize_action_payload(payload)
    action_type = normalized["action_type"]
    request_id = normalized["request_id"]
    started = time.perf_counter()
    handler = handlers.get(action_type)
    if handler is None:
        raise ActionError(ERROR_UNKNOWN_ACTION, f"Unsupported action: {action_type}", {"action_type": action_type})

    try:
        result = handler(normalized["params"])
        if hasattr(result, "__await__"):
            result = await result
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "action_hub action_type=%s source=%s origin=%s request_id=%s status=success latency_ms=%s",
            action_type,
            normalized["source"] or "unknown",
            normalized["origin"] or "unknown",
            request_id or "-",
            latency_ms,
        )
        return {
            "ok": True,
            "action_type": action_type,
            "request_id": request_id,
            "result": result,
            "meta": {
                "entrypoint": ENTRYPOINT_NAME,
                "schema_version": normalized["schema_version"],
                "permission": normalized["permission"],
                "risk_tier": normalized["risk_tier"],
                "latency_ms": latency_ms,
            },
        }
    except Exception as error:
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.warning(
            "action_hub action_type=%s source=%s origin=%s request_id=%s status=error latency_ms=%s error=%s",
            action_type,
            normalized["source"] or "unknown",
            normalized["origin"] or "unknown",
            request_id or "-",
            latency_ms,
            error,
        )
        raise

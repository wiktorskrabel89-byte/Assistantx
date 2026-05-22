from __future__ import annotations

import json
import os
import platform
import re
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import psutil
except Exception:  # pragma: no cover - optional dependency during partial env setup
    psutil = None

WEB_SEARCH_TRIGGERS = (
    "szukaj w sieci",
    "poszukaj w internecie",
    "sprawdź w google",
    "co mówi net na temat",
    "aktualne informacje o",
)

HEAVY_MODEL_HINTS = (
    "32b",
    "coder",
    "qwen2.5-coder",
    "kod",
    "debug",
    "bug",
    "błąd",
    "refaktor",
    "architektur",
    "wieloplik",
    "sql",
    "python",
    "javascript",
    "typescript",
    "html",
    "css",
    "api",
    "test",
)

LIGHT_MODEL_HINTS = (
    "14b",
    "lekki model",
    "szybki czat",
)

DANGEROUS_ACTION_TYPES = {
    "delete_file",
    "delete_folder",
    "format_drive",
    "rm_rf",
    "terminate_process",
    "uninstall_app",
}

DANGEROUS_PROMPT_PATTERNS = (
    r"\busuń\b",
    r"\bdelete\b",
    r"\bremove\b",
    r"\bformat\b",
    r"\bwymaż\b",
    r"\bkill\b",
    r"\brm\s+-rf\b",
    r"\buninstall\b",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip()
    return value or default


def clamp_temperature(value: float) -> float:
    return max(0.0, min(2.0, float(value)))


def parse_temperature_command(prompt: str, current_temp: float) -> tuple[float, bool]:
    cleaned = str(prompt or "").lower().replace(",", ".")
    if "zmien temp" not in cleaned and "zmień temp" not in cleaned:
        return current_temp, False

    number_match = re.search(r"(?<!\d)(\d+(?:\.\d+)?)", cleaned)
    if not number_match:
        return current_temp, False

    try:
        parsed = float(number_match.group(1))
    except ValueError:
        return current_temp, False

    bounded = clamp_temperature(parsed)
    changed = abs(bounded - current_temp) > 1e-9
    return bounded, changed


def _sanitize_source(code: str) -> str:
    sanitized = code
    secret_patterns = [
        r"(?i)\bsk-[a-z0-9]{20,}\b",
        r"(?i)\bghp_[a-z0-9]{20,}\b",
        r"(?i)\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b",
        r"(?i)\b[A-Za-z0-9+/]{30,}={0,2}\b",
    ]
    for pattern in secret_patterns:
        sanitized = re.sub(pattern, "[REDACTED]", sanitized)
    return sanitized


def get_self_code(max_chars: int) -> str:
    try:
        with open(__file__, "r", encoding="utf-8") as source_file:
            code = source_file.read()
    except Exception as exc:
        return f"Nie udało się pobrać kodu źródłowego: {exc}"

    code = _sanitize_source(code)
    if len(code) > max_chars:
        return f"{code[:max_chars]}\n\n# [Truncated by worker to {max_chars} chars]"
    return code


def get_map_widget_code(max_chars: int) -> str:
    try:
        candidate = Path(__file__).resolve().parents[1] / "jarvis" / "desktop" / "map-widget.js"
        if not candidate.exists():
            return ""
        code = candidate.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    code = _sanitize_source(code)
    if len(code) > max_chars:
        return f"{code[:max_chars]}\n\n// [Truncated map-widget.js to {max_chars} chars]"
    return code


@dataclass(frozen=True)
class WorkerConfig:
    supabase_url: str
    supabase_key: str
    supabase_auth_token: str
    ollama_base_url: str
    ollama_model: str
    ollama_light_model: str
    ollama_heavy_model: str
    ollama_light_keep_alive: str | int
    ollama_heavy_keep_alive: str | int
    ollama_timeout_seconds: int
    ollama_retries: int
    openrouter_api_key: str
    cloud_model: str
    cloud_timeout_seconds: int
    cloud_retries: int
    poll_interval_seconds: float
    local_max_processing: int
    task_pick_timeout_seconds: int
    source_code_max_chars: int
    default_temperature: float
    local_enabled: bool
    worker_device_id: str
    cpu_throttle_threshold_pct: float = 85.0
    cpu_throttle_sleep_seconds: float = 15.0
    workspace_root: str = str(Path(__file__).resolve().parents[1])
    action_roots: tuple[str, ...] = ()
    searxng_url: str = "http://127.0.0.1:8080"
    web_search_timeout_seconds: int = 5
    web_search_max_results: int = 5


def load_config() -> WorkerConfig:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or ""
    )
    light_model = os.getenv("LOCAL_OLLAMA_LIGHT_MODEL") or os.getenv("LOCAL_OLLAMA_MODEL") or "qwen2.5:14b"
    heavy_model = os.getenv("LOCAL_OLLAMA_HEAVY_MODEL") or "qwen2.5-coder:32b"
    workspace_root = os.path.abspath(
        os.path.expanduser(
            os.getenv("LOCAL_WORKER_WORKSPACE_ROOT")
            or str(Path(__file__).resolve().parents[1])
        )
    )
    return WorkerConfig(
        supabase_url=supabase_url.rstrip("/"),
        supabase_key=supabase_key,
        supabase_auth_token=os.getenv("SUPABASE_AUTH_TOKEN", "").strip(),
        ollama_base_url=(os.getenv("LOCAL_OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/"),
        ollama_model=light_model,
        ollama_light_model=light_model,
        ollama_heavy_model=os.getenv("LOCAL_OLLAMA_CODER_MODEL") or heavy_model,
        ollama_light_keep_alive=_env_str("LOCAL_OLLAMA_LIGHT_KEEP_ALIVE", "10m"),
        ollama_heavy_keep_alive=_env_str("LOCAL_OLLAMA_HEAVY_KEEP_ALIVE", "20m"),
        ollama_timeout_seconds=max(5, _env_int("LOCAL_OLLAMA_TIMEOUT_SECONDS", 120)),
        ollama_retries=max(1, _env_int("LOCAL_OLLAMA_RETRIES", 2)),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", "").strip(),
        cloud_model=os.getenv("CLOUD_FALLBACK_MODEL", "qwen/qwen-2.5-14b-instruct"),
        cloud_timeout_seconds=max(5, _env_int("CLOUD_FALLBACK_TIMEOUT_SECONDS", 90)),
        cloud_retries=max(1, _env_int("CLOUD_FALLBACK_RETRIES", 2)),
        poll_interval_seconds=max(0.2, _env_float("LOCAL_WORKER_POLL_INTERVAL_SECONDS", 1.0)),
        local_max_processing=max(1, _env_int("LOCAL_WORKER_MAX_PROCESSING", 2)),
        task_pick_timeout_seconds=max(1, _env_int("LOCAL_WORKER_TASK_PICK_TIMEOUT_SECONDS", 10)),
        source_code_max_chars=max(1000, _env_int("LOCAL_WORKER_SOURCE_CODE_MAX_CHARS", 16000)),
        default_temperature=clamp_temperature(_env_float("LOCAL_WORKER_DEFAULT_TEMPERATURE", 0.0)),
        local_enabled=_env_bool("LOCAL_WORKER_ENABLED", True),
        worker_device_id=os.getenv("LOCAL_WORKER_DEVICE_ID", "").strip(),
        cpu_throttle_threshold_pct=max(1.0, min(100.0, _env_float("LOCAL_WORKER_CPU_THROTTLE_PCT", 85.0))),
        cpu_throttle_sleep_seconds=max(1.0, _env_float("LOCAL_WORKER_CPU_THROTTLE_SLEEP_SECONDS", 15.0)),
        workspace_root=workspace_root,
        action_roots=(workspace_root,),
        searxng_url=(os.getenv("LOCAL_SEARXNG_URL") or "http://127.0.0.1:8080").rstrip("/"),
        web_search_timeout_seconds=max(1, _env_int("LOCAL_WEB_SEARCH_TIMEOUT_SECONDS", 5)),
        web_search_max_results=max(1, _env_int("LOCAL_WEB_SEARCH_MAX_RESULTS", 5)),
    )


class ResourceGuard:
    def __init__(self, cpu_threshold_pct: float, throttle_sleep_seconds: float):
        self.cpu_threshold_pct = max(1.0, float(cpu_threshold_pct))
        self.throttle_sleep_seconds = max(1.0, float(throttle_sleep_seconds))

    def current_cpu_pct(self) -> float:
        if psutil is None:
            return 0.0
        try:
            return float(psutil.cpu_percent(interval=1))
        except Exception:
            return 0.0

    def check_and_throttle(self) -> tuple[bool, float]:
        cpu_pct = self.current_cpu_pct()
        if cpu_pct <= self.cpu_threshold_pct:
            return False, cpu_pct
        print(
            f"[Worker][throttle] CPU {cpu_pct:.1f}% exceeded threshold "
            f"{self.cpu_threshold_pct:.1f}%; sleeping {self.throttle_sleep_seconds:.1f}s."
        )
        time.sleep(self.throttle_sleep_seconds)
        return True, cpu_pct


class SupabaseRestClient:
    def __init__(self, url: str, service_key: str, auth_token: str = ""):
        if not url or not service_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required.")
        self.base_url = url.rstrip("/")
        self.service_key = service_key
        self.auth_token = auth_token.strip()

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        body: dict[str, Any] | list[dict[str, Any]] | None = None,
        prefer: str | None = None,
        timeout_seconds: int = 30,
    ) -> Any:
        url = f"{self.base_url}{path}"
        if params:
            encoded = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
            url = f"{url}?{encoded}"
        headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.auth_token}" if self.auth_token else f"Bearer {self.service_key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        payload = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url=url, data=payload, headers=headers, method=method.upper())
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read().decode("utf-8")
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return raw

    def fetch_processing_count(self, *, device_id: str | None = None) -> int:
        params = {
            "select": "task_id",
            "status": "eq.processing",
            "routing": "eq.local",
        }
        if device_id:
            params["device_id"] = f"eq.{device_id}"
        rows = self._request(
            "GET",
            "/rest/v1/ai_tasks",
            params=params,
        )
        return len(rows or [])

    def fetch_pending_local_tasks(self, *, limit: int = 25, device_id: str | None = None) -> list[dict[str, Any]]:
        params = {
            "select": "task_id,user_id,device_id,prompt,temperature,created_at,status,routing,category,action_type,payload,approval_required,approval_decision,approved_by,approval_at",
            "status": "eq.pending",
            "routing": "eq.local",
            "order": "created_at.asc",
            "limit": str(max(1, limit)),
        }
        if device_id:
            params["device_id"] = f"eq.{device_id}"
        rows = self._request(
            "GET",
            "/rest/v1/ai_tasks",
            params=params,
        )
        return list(rows or [])

    def fetch_approved_tasks(self, *, limit: int = 10, device_id: str | None = None) -> list[dict[str, Any]]:
        params = {
            "select": "task_id,user_id,device_id,prompt,temperature,created_at,status,routing,category,action_type,payload,approval_required,approval_decision,approved_by,approval_at",
            "status": "eq.approved",
            "routing": "eq.local",
            "order": "approval_at.asc.nullsfirst,created_at.asc",
            "limit": str(max(1, limit)),
        }
        if device_id:
            params["device_id"] = f"eq.{device_id}"
        rows = self._request("GET", "/rest/v1/ai_tasks", params=params)
        return list(rows or [])

    def claim_task(
        self,
        *,
        device_id: str | None,
        include_unassigned: bool,
        route_to_cloud: bool,
        fallback_reason: str | None = None,
    ) -> dict[str, Any] | None:
        rows = self._request(
            "POST",
            "/rest/v1/rpc/claim_next_ai_task",
            body={
                "p_target_device_id": device_id or None,
                "p_include_unassigned": include_unassigned,
                "p_route_to_cloud": route_to_cloud,
                "p_fallback_reason": fallback_reason,
            },
            prefer="return=representation",
        )
        if not rows:
            return None
        return rows[0]

    def get_user_profile_temperature(self, user_id: str, fallback: float) -> float:
        rows = self._request(
            "GET",
            "/rest/v1/user_profiles",
            params={
                "select": "user_id,default_temperature",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        if not rows:
            return fallback
        value = rows[0].get("default_temperature", fallback)
        try:
            return clamp_temperature(float(value))
        except (TypeError, ValueError):
            return fallback

    def upsert_user_profile_temperature(self, user_id: str, value: float) -> None:
        self._request(
            "POST",
            "/rest/v1/user_profiles",
            body=[{"user_id": user_id, "default_temperature": clamp_temperature(value)}],
            prefer="resolution=merge-duplicates",
        )

    def update_task_temperature(self, task_id: str, value: float) -> None:
        self._request(
            "PATCH",
            "/rest/v1/ai_tasks",
            params={"task_id": f"eq.{task_id}"},
            body={"temperature": clamp_temperature(value)},
        )

    def complete_task(
        self,
        task_id: str,
        *,
        response_text: str,
        provider: str,
        model: str,
        routing: str,
        fallback_reason: str | None = None,
    ) -> None:
        self._request(
            "PATCH",
            "/rest/v1/ai_tasks",
            params={"task_id": f"eq.{task_id}"},
            body={
                "status": "completed",
                "response": response_text,
                "provider": provider,
                "model": model,
                "routing": routing,
                "fallback_reason": fallback_reason,
                "error": None,
                "completed_at": _utc_now_iso(),
            },
        )

    def fail_task(self, task_id: str, error_message: str) -> None:
        self._request(
            "PATCH",
            "/rest/v1/ai_tasks",
            params={"task_id": f"eq.{task_id}"},
            body={
                "status": "failed",
                "error": str(error_message)[:2000],
                "completed_at": _utc_now_iso(),
            },
        )

    def claim_approved_task(self, task_id: str) -> dict[str, Any] | None:
        rows = self._request(
            "PATCH",
            "/rest/v1/ai_tasks",
            params={"task_id": f"eq.{task_id}", "status": "eq.approved", "select": "*"},
            body={"status": "processing", "started_at": _utc_now_iso()},
            prefer="return=representation",
        )
        if not rows:
            return None
        return rows[0]

    def require_approval(self, task: dict[str, Any], *, prompt_summary: str) -> None:
        task_id = str(task.get("task_id") or "")
        user_id = str(task.get("user_id") or "")
        action_type = str(task.get("action_type") or "").strip().lower() or None
        self._request(
            "PATCH",
            "/rest/v1/ai_tasks",
            params={"task_id": f"eq.{task_id}"},
            body={
                "status": "pending_approval",
                "approval_required": True,
                "approval_decision": None,
                "approved_by": None,
                "approval_at": None,
                "started_at": None,
            },
        )
        self.insert_notification(
            user_id=user_id,
            kind="warning",
            title="Approval required",
            body=prompt_summary,
            task_id=task_id,
            metadata={"actionType": action_type, "approvalRequired": True},
            source="worker",
            dedup_key=f"ai-task-approval:{task_id}",
        )

    def insert_notification(
        self,
        *,
        user_id: str,
        kind: str,
        title: str,
        body: str,
        task_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        source: str | None = None,
        dedup_key: str | None = None,
    ) -> None:
        if not user_id:
            return
        self._request(
            "POST",
            "/rest/v1/notifications",
            body=[{
                "user_id": user_id,
                "kind": kind,
                "title": title,
                "body": body,
                "task_id": task_id,
                "metadata": metadata or {},
                "source": source,
                "dedup_key": dedup_key,
                "created_at": _utc_now_iso(),
            }],
            prefer="resolution=merge-duplicates",
        )

    def insert_audit_log(
        self,
        *,
        event_type: str,
        user_id: str | None,
        target_type: str | None,
        target_id: str | None,
        payload: dict[str, Any],
        organization_id: str | None = None,
        execution_id: str | None = None,
    ) -> None:
        self._request(
            "POST",
            "/rest/v1/audit_logs",
            body=[{
                "event_type": event_type,
                "user_id": user_id,
                "organization_id": organization_id,
                "execution_id": execution_id,
                "target_type": target_type,
                "target_id": target_id,
                "payload": payload,
                "created_at": _utc_now_iso(),
            }],
        )

    def get_device(self, device_id: str) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "/rest/v1/devices",
            params={
                "select": "*",
                "id": f"eq.{device_id}",
                "limit": "1",
            },
        )
        if not rows:
            return None
        return rows[0]

    def update_device(self, device_id: str, patch: dict[str, Any]) -> None:
        self._request(
            "PATCH",
            "/rest/v1/devices",
            params={"id": f"eq.{device_id}"},
            body=patch,
        )


def _post_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    raw_payload = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=raw_payload,
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def is_ollama_available(config: WorkerConfig) -> bool:
    if not config.local_enabled:
        return False
    url = f"{config.ollama_base_url}/api/tags"
    req = urllib.request.Request(url=url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return int(getattr(resp, "status", 200)) < 500
    except Exception:
        return False


def _build_system_instruction(source_code: str, web_context: str = "") -> str:
    base = (
        "Jesteś Jarvisem, zaawansowanym asystentem systemowym. Masz pełny wgląd w swój aktualny kod źródłowy "
        "backendu Pythona (Local Worker), na którym teraz pracujesz. Poniżej znajduje się Twój kod. "
        "Użyj go, jeśli użytkownik zapyta o Twoją strukturę, działanie lub poprosi o modyfikację:\n\n"
        f"```python\n{source_code}\n```"
    )
    if web_context:
        return f"{base}\n\nKontekst z lokalnego SearXNG:\n{web_context}"
    return base


def _system_status_ping() -> str:
    memory = {"available": psutil is not None}
    if psutil is not None:
        try:
            vm = psutil.virtual_memory()
            memory = {
                "available": True,
                "total_mb": round(vm.total / (1024 * 1024), 1),
                "used_mb": round(vm.used / (1024 * 1024), 1),
                "percent": float(vm.percent),
            }
        except Exception:
            pass
    payload = {
        "platform": platform.platform(),
        "hostname": socket.gethostname(),
        "memory": memory,
        "gpu": {"available": False},
    }
    return json.dumps(payload, ensure_ascii=False)


def _prompt_is_dangerous(prompt: str) -> bool:
    lowered = str(prompt or "").lower()
    return any(re.search(pattern, lowered) for pattern in DANGEROUS_PROMPT_PATTERNS)


def _task_requires_approval(task: dict[str, Any]) -> bool:
    status = str(task.get("status") or "").strip().lower()
    if status in {"approved", "rejected", "pending_approval", "processing", "completed", "failed", "cancelled"}:
        return False
    action_type = str(task.get("action_type") or "").strip().lower()
    if action_type in DANGEROUS_ACTION_TYPES:
        return True
    return _prompt_is_dangerous(str(task.get("prompt") or ""))


def _summarize_approval_prompt(task: dict[str, Any]) -> str:
    action_type = str(task.get("action_type") or "system_action").strip() or "system_action"
    prompt = str(task.get("prompt") or "").strip()
    if len(prompt) > 180:
        prompt = f"{prompt[:177]}..."
    return f"Task `{action_type}` is waiting for approval: {prompt or 'No prompt summary available.'}"


def _choose_local_model(config: WorkerConfig, prompt: str) -> str:
    prompt_lower = prompt.lower()
    if any(keyword in prompt_lower for keyword in ("kod", "code", "program", "script", "skrypt", "debug", "refactor")):
        return config.ollama_heavy_model
    return config.ollama_light_model


def _extract_web_search_context(config: WorkerConfig, prompt: str) -> tuple[str, str]:
    lowered = prompt.lower()
    if "szukaj w sieci" not in lowered and "search the web" not in lowered:
        return prompt, ""

    cleaned = re.sub(r"(?i)szukaj w sieci|search the web", "", prompt).strip()
    if not cleaned:
        cleaned = prompt
    params = urllib.parse.urlencode({
        "q": cleaned,
        "format": "json",
        "language": "pl-PL",
    })
    try:
        req = urllib.request.Request(url=f"{config.searxng_url}?{params}", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        results = payload.get("results", [])[:3]
        snippets = []
        for index, result in enumerate(results, start=1):
            if not isinstance(result, dict):
                continue
            title = str(result.get("title") or "Untitled")
            content = str(result.get("content") or result.get("url") or "").strip()
            snippets.append(f"[{index}] {title}: {content}")
        return cleaned, "\n".join(snippets)
    except Exception as exc:
        return cleaned, f"[SearXNG unavailable] {exc}"


def _resolve_allowed_path(config: WorkerConfig, raw_path: str) -> str:
    candidate = os.path.abspath(os.path.expanduser(raw_path))
    for root in config.action_roots:
        if candidate == root or candidate.startswith(f"{root}{os.sep}"):
            return candidate
    raise RuntimeError(f"Path outside allowed roots: {candidate}")


def execute_system_action(config: WorkerConfig, action_type: str, payload: dict[str, Any]) -> str:
    normalized_action = action_type.strip().lower()
    if normalized_action == "launch_roblox":
        game_id = str(payload.get("game_id") or payload.get("gameId") or "185655149").strip()
        if not re.fullmatch(r"\d{3,20}", game_id):
            raise RuntimeError("Invalid Roblox game id.")
        roblox_url = f"roblox://placeId={game_id}"
        if not webbrowser.open(roblox_url):
            raise RuntimeError("Roblox URI handler did not acknowledge the launch request.")
        return f"Roblox launch requested for placeId={game_id}."

    if normalized_action == "system_file_list":
        target = _resolve_allowed_path(config, str(payload.get("path") or ".").strip())
        entries = sorted(os.listdir(target))[:100]
        return json.dumps({"path": target, "entries": entries}, ensure_ascii=False)

    raise RuntimeError(f"Unsupported system action: {action_type}")


def _should_attach_map_code(prompt: str) -> bool:
    lowered = str(prompt or "").lower()
    return (
        "map" in lowered
        or "mapa" in lowered
        or "jarvis code" in lowered
        or "kod jarvis" in lowered
        or "map-widget" in lowered
    )


def _append_web_search_context(system_instruction: str, web_context: str) -> str:
    context = str(web_context or "").strip()
    if not context:
        return system_instruction
    return (
        f"{system_instruction}\n\n"
        "Masz też świeży kontekst z lokalnej metawyszukiwarki SearXNG. "
        "Korzystaj z niego tylko wtedy, gdy jest istotny dla odpowiedzi:\n\n"
        f"{context}"
    )


def _detect_local_model(config: WorkerConfig, raw_prompt: str) -> str:
    prompt = str(raw_prompt or "").lower()
    if any(token in prompt for token in LIGHT_MODEL_HINTS):
        return config.ollama_light_model
    if any(token in prompt for token in HEAVY_MODEL_HINTS):
        return config.ollama_heavy_model
    return config.ollama_light_model


def _get_keep_alive_for_model(config: WorkerConfig, model_name: str) -> str | int:
    if model_name == config.ollama_heavy_model:
        return config.ollama_heavy_keep_alive
    return config.ollama_light_keep_alive


def _extract_web_search_query(raw_prompt: str) -> str | None:
    prompt = str(raw_prompt or "").strip()
    lowered = prompt.lower()
    for trigger in WEB_SEARCH_TRIGGERS:
        index = lowered.find(trigger)
        if index < 0:
            continue
        query = prompt[index + len(trigger):].strip(" :,-–—")
        return query or prompt
    return None


def _search_searxng(config: WorkerConfig, query: str) -> list[dict[str, str]]:
    url = f"{config.searxng_url}/search?{urllib.parse.urlencode({'q': query, 'format': 'json'})}"
    request = urllib.request.Request(
        url=url,
        headers={
            "Accept": "application/json",
            "User-Agent": "AssistantX-Local-Worker/1.0",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=config.web_search_timeout_seconds) as response:
        payload = json.loads(response.read().decode("utf-8"))
    results: list[dict[str, str]] = []
    for item in payload.get("results", [])[: config.web_search_max_results]:
        results.append({
            "title": str(item.get("title", "")).strip(),
            "url": str(item.get("url", "")).strip(),
            "content": str(item.get("content", "")).strip(),
            "engine": str(item.get("engine", "")).strip(),
        })
    return results


def _build_web_search_context(config: WorkerConfig, raw_prompt: str) -> str:
    query = _extract_web_search_query(raw_prompt)
    if not query:
        return ""
    try:
        results = _search_searxng(config, query)
    except Exception as exc:
        print(f"[Worker][warn] SearXNG lookup failed for query={query!r}: {exc}")
        return ""
    if not results:
        return ""
    lines = [f"Wyniki lokalnego wyszukiwania dla: {query}"]
    for index, item in enumerate(results, start=1):
        lines.append(
            f"[{index}] {item['title'] or item['url'] or 'Brak tytułu'}\n"
            f"URL: {item['url'] or 'brak'}\n"
            f"Treść: {item['content'] or 'brak'}"
        )
    return "\n\n".join(lines)


def _resolve_system_action_path(config: WorkerConfig, requested_path: str) -> str:
    root = os.path.realpath(config.workspace_root)
    candidate = requested_path.strip() or "."
    resolved = os.path.realpath(candidate if os.path.isabs(candidate) else os.path.join(root, candidate))
    try:
        if os.path.commonpath([root, resolved]) != root:
            raise PermissionError("requested path escapes workspace root")
    except ValueError as exc:
        raise PermissionError("invalid workspace path") from exc
    return resolved


def execute_system_action(config: WorkerConfig, task: dict[str, Any]) -> tuple[str, str]:
    action_type = str(task.get("action_type") or "").strip().lower()
    payload = task.get("payload")
    if not isinstance(payload, dict):
        payload = {}

    if action_type == "list_files":
        target_path = _resolve_system_action_path(config, str(payload.get("path") or "."))
        entries = sorted(os.listdir(target_path))[:100]
        rendered = []
        for entry in entries:
            full_path = os.path.join(target_path, entry)
            suffix = "/" if os.path.isdir(full_path) else ""
            rendered.append(f"- {entry}{suffix}")
        body = "\n".join(rendered) if rendered else "- (pusto)"
        return action_type, f"📁 Zawartość katalogu `{target_path}`:\n{body}"

    if action_type == "open_uri":
        return action_type, "⚠️ Akcja `open_uri` wymaga dedykowanego wykonawcy hosta i nie jest obsługiwana przez worker HTTP-only."

    return (action_type or "system_action"), f"⚠️ Nieobsługiwana akcja systemowa: `{action_type or 'unknown'}`."


def generate_with_ollama(
    config: WorkerConfig,
    *,
    model_name: str,
    raw_prompt: str,
    temperature: float,
    system_instruction: str,
    keep_alive: str | int,
) -> str:
    request_payload = {
        "model": model_name,
        "prompt": f"{system_instruction}\n\nUżytkownik: {raw_prompt}",
        "stream": False,
        "options": {"temperature": clamp_temperature(temperature)},
        "keep_alive": keep_alive,
    }
    headers = {"Content-Type": "application/json"}
    last_exc: Exception | None = None
    for attempt in range(1, config.ollama_retries + 1):
        try:
            response = _post_json(
                f"{config.ollama_base_url}/api/generate",
                headers,
                request_payload,
                timeout_seconds=config.ollama_timeout_seconds,
            )
            return str(response.get("response", "")).strip()
        except Exception as exc:
            last_exc = exc
            print(f"[Worker][warn] Ollama attempt {attempt}/{config.ollama_retries} failed: {exc}")
            time.sleep(min(1.5 * attempt, 3.0))
    raise RuntimeError(f"Ollama generation failed after retries: {last_exc}")


def generate_with_cloud_fallback(
    config: WorkerConfig,
    *,
    raw_prompt: str,
    temperature: float,
    system_instruction: str,
) -> str:
    if not config.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required for cloud fallback.")
    payload = {
        "model": config.cloud_model,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": raw_prompt},
        ],
        "temperature": clamp_temperature(temperature),
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.openrouter_api_key}",
    }
    last_exc: Exception | None = None
    for attempt in range(1, config.cloud_retries + 1):
        try:
            response = _post_json(
                "https://openrouter.ai/api/v1/chat/completions",
                headers,
                payload,
                timeout_seconds=config.cloud_timeout_seconds,
            )
            return str(response.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()
        except Exception as exc:
            last_exc = exc
            print(f"[Worker][warn] Cloud fallback attempt {attempt}/{config.cloud_retries} failed: {exc}")
            time.sleep(min(1.5 * attempt, 3.0))
    raise RuntimeError(f"Cloud fallback failed after retries: {last_exc}")


def _parse_created_at(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        normalized = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _seconds_since_created(task: dict[str, Any]) -> float:
    created = _parse_created_at(task.get("created_at"))
    if not created:
        return 0.0
    return max(0.0, (datetime.now(timezone.utc) - created).total_seconds())


def should_force_cloud_fallback(
    config: WorkerConfig,
    *,
    processing_count: int,
    task_age_seconds: float,
    local_available: bool,
) -> bool:
    if not local_available:
        return True
    if processing_count >= config.local_max_processing and task_age_seconds >= config.task_pick_timeout_seconds:
        return True
    return False


def _normalize_mac_from_int(value: int) -> str | None:
    if value <= 0:
        return None
    parts = [f"{(value >> shift) & 0xFF:02X}" for shift in range(40, -1, -8)]
    mac = ":".join(parts)
    return mac if mac != "00:00:00:00:00:00" else None


def detect_primary_mac() -> str | None:
    try:
        return _normalize_mac_from_int(uuid.getnode())
    except Exception:
        return None


def detect_public_ipv6() -> str | None:
    for url in ("https://api64.ipify.org?format=json", "https://ifconfig.co/json"):
        try:
            req = urllib.request.Request(url=url, method="GET", headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            candidate = str(payload.get("ip") or payload.get("ip_addr") or "").strip()
            if ":" in candidate:
                return candidate
        except Exception:
            continue
    return None


def detect_windows_bios_info() -> tuple[str | None, str | None]:
    if os.name != "nt":
        return None, None
    try:
        output = subprocess.check_output(
            ["wmic", "baseboard", "get", "manufacturer,product", "/value"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=5,
        )
    except Exception:
        return None, None

    manufacturer = None
    model = None
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if line.startswith("Manufacturer="):
            manufacturer = line.split("=", 1)[1].strip() or None
        elif line.startswith("Product="):
            model = line.split("=", 1)[1].strip() or None
    return manufacturer, model


def infer_setup_guidance(manufacturer: str | None) -> tuple[str, str | None]:
    normalized = (manufacturer or "").lower()
    if "dell" in normalized:
        return "needs_bios_manual_step", "Enable Wake on LAN in BIOS (Dell: press F2, Power Management → Wake on LAN)."
    if "asus" in normalized:
        return "needs_bios_manual_step", "Enable Wake on LAN in BIOS (ASUS: Advanced → APM / Power settings)."
    if "lenovo" in normalized:
        return "needs_bios_manual_step", "If wake still fails, verify BIOS Wake on LAN under Power settings."
    if "hp" in normalized:
        return "needs_bios_manual_step", "If wake still fails, verify BIOS Wake on LAN under Power Management."
    return "waiting_for_pairing", "Complete desktop pairing, then verify BIOS Wake on LAN if remote wake fails."


def sync_worker_device_registration(config: WorkerConfig, supabase: SupabaseRestClient) -> None:
    device_id = config.worker_device_id.strip()
    if not device_id:
        return
    device = supabase.get_device(device_id)
    if not device:
        return

    metadata = device.get("metadata") if isinstance(device.get("metadata"), dict) else {}
    mac_address = detect_primary_mac()
    public_ipv6 = detect_public_ipv6()
    bios_manufacturer, bios_model = detect_windows_bios_info()
    hardware_id = (
        str(device.get("hardware_id") or "").strip()
        or os.getenv("LOCAL_WORKER_HARDWARE_ID", "").strip()
        or f"{platform.node()}-{uuid.getnode():012x}"
    )
    setup_state, setup_hint = infer_setup_guidance(bios_manufacturer)
    if str(device.get("trust_state") or "") == "trusted":
        setup_state = "ready" if mac_address else "paired"

    merged_metadata = {
        **metadata,
        "setupHint": setup_hint,
        "setupSource": "ai-agent/worker.py",
        "publicIpv6": public_ipv6,
        "workerPlatform": platform.platform(),
        "workerHostname": socket.gethostname(),
        "workerLastHeartbeatAt": _utc_now_iso(),
    }
    supabase.update_device(
        device_id,
        {
            "hardware_id": hardware_id,
            "bios_manufacturer": bios_manufacturer,
            "bios_model": bios_model,
            "setup_state": setup_state,
            "last_seen_at": _utc_now_iso(),
            "last_known_mac": mac_address,
            "last_known_ipv6": public_ipv6,
            "last_public_ipv6_discovered_at": _utc_now_iso() if public_ipv6 else device.get("last_public_ipv6_discovered_at"),
            "metadata": merged_metadata,
        },
    )


def execute_system_action(task: dict[str, Any], config: WorkerConfig) -> str:
    action_type = str(task.get("action_type") or "").strip().lower()
    payload = task.get("payload") if isinstance(task.get("payload"), dict) else {}
    if action_type == "launch_roblox":
        game_id = str(payload.get("gameId") or payload.get("game_id") or "185655149").strip()
        if not re.fullmatch(r"\d{1,20}", game_id):
            game_id = "185655149"
        if os.name != "nt":
            raise RuntimeError("Roblox launch is currently supported only on Windows runtimes.")
        uri = f"roblox://placeId={game_id}"
        subprocess.Popen(
            ["cmd", "/c", "start", "", uri],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return f"Roblox launch requested for placeId={game_id}."
    if action_type == "system_file_list":
        target_path = _resolve_system_action_path(config, str(payload.get("path") or "."))
        entries = []
        for entry in sorted(os.listdir(target_path))[:100]:
            full_path = os.path.join(target_path, entry)
            entries.append({
                "name": entry,
                "type": "directory" if os.path.isdir(full_path) else "file",
            })
        return json.dumps({"path": target_path, "entries": entries}, ensure_ascii=False)
    if action_type == "system_status_ping":
        return _system_status_ping()
    raise RuntimeError(f"Unsupported system_action: {action_type or 'unknown'}")


def process_task(
    config: WorkerConfig,
    supabase: SupabaseRestClient,
    task: dict[str, Any],
    *,
    route_to_cloud: bool,
    fallback_reason: str | None = None,
) -> None:
    task_id = str(task.get("task_id"))
    user_id = str(task.get("user_id") or "")
    raw_prompt = str(task.get("prompt") or "")
    category = str(task.get("category") or "ai_request").strip().lower()
    if not task_id or not user_id or not raw_prompt:
        return

    if category == "system_action" and _task_requires_approval(task):
        supabase.require_approval(task, prompt_summary=_summarize_approval_prompt(task))
        try:
            supabase.insert_audit_log(
                event_type="ai_task_pending_approval",
                user_id=user_id,
                target_type="ai_task",
                target_id=task_id,
                payload={"action_type": task.get("action_type"), "status": "pending_approval"},
            )
        except Exception:
            pass
        print(f"[Worker] Task requires approval task={task_id} action={task.get('action_type')}")
        return

    if category == "system_action":
        response_text = execute_system_action(task, config)
        supabase.complete_task(
            task_id,
            response_text=response_text,
            provider="jarvis-worker",
            model=str(task.get("action_type") or "system_action"),
            routing="local",
            fallback_reason=fallback_reason,
        )
        print(f"[Worker] Completed system_action task={task_id} action={task.get('action_type')}")
        return

    try:
        profile_default = supabase.get_user_profile_temperature(user_id, config.default_temperature)
    except Exception as exc:
        print(f"[Worker][warn] Could not read user profile temperature for {user_id}: {exc}")
        profile_default = config.default_temperature

    task_temperature = task.get("temperature")
    if task_temperature is None:
        current_temp = profile_default
        try:
            supabase.update_task_temperature(task_id, current_temp)
        except Exception as exc:
            print(f"[Worker][warn] Failed to freeze task temperature for {task_id}: {exc}")
    else:
        try:
            current_temp = clamp_temperature(float(task_temperature))
        except (TypeError, ValueError):
            current_temp = profile_default
            try:
                supabase.update_task_temperature(task_id, current_temp)
            except Exception:
                pass

    parsed_temp, changed = parse_temperature_command(raw_prompt, current_temp)
    if changed:
        current_temp = parsed_temp
        try:
            supabase.update_task_temperature(task_id, current_temp)
            supabase.upsert_user_profile_temperature(user_id, current_temp)
            print(f"[Worker][config] Temperature updated to {current_temp:.2f} for task {task_id}")
        except Exception as exc:
            print(f"[Worker][warn] Failed to persist temperature update for {task_id}: {exc}")

    system_instruction = _build_system_instruction(get_self_code(config.source_code_max_chars))
    output_text = ""
    provider = "local_worker"
    model = "ai_request"
    routing = "local"

    try:
        if route_to_cloud:
            output_text = generate_with_cloud_fallback(
                config,
                raw_prompt=raw_prompt,
                temperature=current_temp,
                system_instruction=system_instruction,
            )
            provider = "openrouter"
            model = config.cloud_model
            routing = "cloud"
        else:
            model = _detect_local_model(config, raw_prompt)
            output_text = generate_with_ollama(
                config,
                model_name=model,
                raw_prompt=raw_prompt,
                temperature=current_temp,
                system_instruction=system_instruction,
                keep_alive=_get_keep_alive_for_model(config, model),
            )
            provider = "ollama"
    except Exception as local_exc:
        if route_to_cloud:
            raise
        print(f"[Worker][warn] Local generation failed for {task_id}, trying cloud fallback: {local_exc}")
        output_text = generate_with_cloud_fallback(
            config,
            raw_prompt=raw_prompt,
            temperature=current_temp,
            system_instruction=system_instruction,
        )
        provider = "openrouter"
        model = config.cloud_model
        routing = "cloud"
        fallback_reason = "local_generation_failed"

    if changed:
        output_text = f"🔧 [System: Temperatura została zmieniona na {current_temp:.2f}]\n\n{output_text}"

    supabase.complete_task(
        task_id,
        response_text=output_text,
        provider=provider,
        model=model,
        routing=routing,
        fallback_reason=fallback_reason,
    )
    try:
        supabase.insert_audit_log(
            event_type="ai_task_completed",
            user_id=user_id,
            target_type="ai_task",
            target_id=task_id,
            payload={"provider": provider, "model": model, "routing": routing},
        )
    except Exception:
        pass
    print(f"[Worker] Completed task={task_id} provider={provider} model={model} routing={routing}")


def fetch_next_task(config: WorkerConfig, supabase: SupabaseRestClient) -> tuple[dict[str, Any] | None, bool, str | None]:
    local_available = is_ollama_available(config)
    approved = supabase.fetch_approved_tasks(limit=10, device_id=config.worker_device_id or None)
    for candidate in approved:
        claimed = supabase.claim_approved_task(str(candidate.get("task_id") or ""))
        if claimed:
            return claimed, False, None

    processing_count = supabase.fetch_processing_count(device_id=config.worker_device_id or None)
    pending = supabase.fetch_pending_local_tasks(limit=10, device_id=config.worker_device_id or None)
    if not pending:
        return None, False, None

    fallback = False
    fallback_reason = None
    if not local_available:
        if not config.openrouter_api_key:
            return None, False, None
        fallback = True
        fallback_reason = "local_runtime_unavailable"
    elif processing_count >= config.local_max_processing and config.openrouter_api_key:
        fallback = True
        fallback_reason = "local_queue_overflow"

    claimed = supabase.claim_next_task(
        device_id=config.worker_device_id or None,
        include_unassigned=True,
        route_to_cloud=fallback,
        fallback_reason=fallback_reason,
    )
    if not claimed:
        return None, False, None
    return claimed, fallback, fallback_reason


def run_worker_forever() -> None:
    config = load_config()
    supabase = SupabaseRestClient(config.supabase_url, config.supabase_key, auth_token=config.supabase_auth_token)
    resource_guard = ResourceGuard(config.cpu_throttle_threshold_pct, config.cpu_throttle_sleep_seconds)
    print(
        "[Worker] Started with "
        f"local_model={config.ollama_light_model} cloud_model={config.cloud_model} "
        f"max_processing={config.local_max_processing} pick_timeout={config.task_pick_timeout_seconds}s "
        f"device_id={config.worker_device_id or 'none'} auth_mode={'user_jwt' if config.supabase_auth_token else 'service_key'}"
    )
    last_device_sync_at = 0.0

    while True:
        try:
            throttled, cpu_pct = resource_guard.check_and_throttle()
            if throttled:
                try:
                    supabase.insert_audit_log(
                        event_type="worker_cpu_throttled",
                        user_id=None,
                        target_type="worker",
                        target_id=config.worker_device_id or "local-worker",
                        payload={
                            "cpu_percent": round(cpu_pct, 2),
                            "threshold_percent": config.cpu_throttle_threshold_pct,
                            "sleep_seconds": config.cpu_throttle_sleep_seconds,
                        },
                    )
                except Exception:
                    pass
            if config.worker_device_id and time.time() - last_device_sync_at >= 60.0:
                sync_worker_device_registration(config, supabase)
                last_device_sync_at = time.time()
            task, route_to_cloud, fallback_reason = fetch_next_task(config, supabase)
            if not task:
                time.sleep(config.poll_interval_seconds)
                continue
            process_task(
                config,
                supabase,
                task,
                route_to_cloud=route_to_cloud,
                fallback_reason=fallback_reason,
            )
        except urllib.error.HTTPError as exc:
            print(f"[Worker][error] HTTP error: {exc} | body={exc.read().decode('utf-8', errors='ignore')}")
            time.sleep(config.poll_interval_seconds)
        except Exception as exc:
            task_id = None
            if "task" in locals() and isinstance(task, dict):
                task_id = task.get("task_id")
            print(f"[Worker][error] Unexpected worker error: {exc}")
            if task_id:
                try:
                    supabase.fail_task(str(task_id), str(exc))
                    if "task" in locals() and isinstance(task, dict):
                        supabase.insert_audit_log(
                            event_type="ai_task_failed",
                            user_id=str(task.get("user_id") or "") or None,
                            target_type="ai_task",
                            target_id=str(task_id),
                            payload={"error": str(exc)[:500]},
                        )
                except Exception:
                    pass
            time.sleep(config.poll_interval_seconds)


if __name__ == "__main__":
    run_worker_forever()

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import tempfile
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


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip()
    return value or default
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
    device_id: str
    allowed_directory: str


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
        device_id=_env_str("LOCAL_WORKER_DEVICE_ID", ""),
        allowed_directory=str(Path(_env_str("LOCAL_WORKER_ALLOWED_DIRECTORY", str(Path(__file__).resolve().parent.parent))).resolve()),
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

    def claim_next_task(
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


ALLOWED_SYSTEM_ACTIONS = {
    "launch_roblox",
    "open_app",
    "system_screenshot",
    "system_sleep",
    "system_file_list",
    "system_file_read",
    "system_file_search",
    "system_status_ping",
    "system_repo_status",
    "system_repo_index",
    "system_ignore_update",
    "system_db_query",
}


def _safe_json_dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)


def _coerce_payload(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    return {}


def _resolve_allowed_path(config: WorkerConfig, requested_path: str) -> Path:
    base = Path(config.allowed_directory).resolve()
    candidate = Path(requested_path or ".")
    resolved = candidate.resolve() if candidate.is_absolute() else (base / candidate).resolve()
    try:
        resolved.relative_to(base)
    except ValueError as exc:
        raise RuntimeError("Requested path is outside the allowed local worker directory.") from exc
    return resolved


def _list_allowed_directory(config: WorkerConfig, payload: dict[str, Any]) -> str:
    resolved = _resolve_allowed_path(config, str(payload.get("path") or "."))
    if not resolved.exists():
        raise RuntimeError(f"Requested path does not exist: {resolved}")
    if not resolved.is_dir():
        raise RuntimeError(f"Requested path is not a directory: {resolved}")

    entries = []
    for item in sorted(resolved.iterdir(), key=lambda value: value.name.lower()):
        entries.append({
            "name": item.name,
            "type": "directory" if item.is_dir() else "file",
        })

    return _safe_json_dumps({
        "path": str(resolved),
        "entries": entries,
    })


def _read_allowed_file(config: WorkerConfig, payload: dict[str, Any]) -> str:
    requested_path = str(payload.get("path") or "").strip()
    if not requested_path:
        raise RuntimeError("File path is required.")
    resolved = _resolve_allowed_path(config, requested_path)
    if not resolved.exists():
        raise RuntimeError(f"Requested file does not exist: {resolved}")
    if not resolved.is_file():
        raise RuntimeError(f"Requested path is not a file: {resolved}")
    raw = resolved.read_text(encoding="utf-8", errors="ignore")
    preview = raw[:4000]
    return _safe_json_dumps({
        "path": str(resolved),
        "size": len(raw),
        "preview": preview,
        "truncated": len(raw) > len(preview),
    })


def _search_allowed_files(config: WorkerConfig, payload: dict[str, Any]) -> str:
    query = str(payload.get("query") or "").strip().lower()
    if not query:
        raise RuntimeError("Search query is required.")
    base = Path(config.allowed_directory).resolve()
    results: list[dict[str, Any]] = []
    for path in base.rglob("*"):
        if len(results) >= 20:
            break
        if not path.is_file():
            continue
        try:
            if query in path.name.lower():
                results.append({"path": str(path), "match": "filename"})
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            index = text.lower().find(query)
            if index >= 0:
                snippet_start = max(0, index - 120)
                snippet_end = min(len(text), index + 240)
                results.append({
                    "path": str(path),
                    "match": "content",
                    "snippet": text[snippet_start:snippet_end].replace("\n", " "),
                })
        except Exception:
            continue
    return _safe_json_dumps({"query": query, "results": results})


def _open_app(payload: dict[str, Any]) -> str:
    app = str(payload.get("app") or payload.get("target") or "").strip()
    if not app:
        raise RuntimeError("App target is required.")
    if len(app) > 240:
        raise RuntimeError("App target is too long.")
    if platform.system().lower().startswith("win"):
        os.startfile(app)  # type: ignore[attr-defined]
        return f"Otworzono lokalny cel: {app}"
    subprocess.Popen([app], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return f"Opened local target: {app}"


def _launch_roblox(payload: dict[str, Any]) -> str:
    game_id = str(payload.get("game_id") or "").strip() or "185655149"
    if not re.fullmatch(r"\d{3,20}", game_id):
        raise RuntimeError("Invalid Roblox game_id.")

    roblox_uri = f"roblox://placeId={game_id}"
    if platform.system().lower().startswith("win"):
        subprocess.Popen(
            ["cmd", "/c", "start", "", roblox_uri],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return f"Uruchomiono Roblox na lokalnym komputerze (placeId={game_id})."

    raise RuntimeError("launch_roblox is currently supported only on Windows workers.")


def _capture_screenshot() -> str:
    if not platform.system().lower().startswith("win"):
        raise RuntimeError("system_screenshot is currently supported only on Windows workers.")
    screenshot_path = Path(tempfile.gettempdir()) / f"assistantx_screenshot_{int(time.time())}.png"
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "Add-Type -AssemblyName System.Drawing; "
        "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
        "$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; "
        "$graphics = [System.Drawing.Graphics]::FromImage($bitmap); "
        "$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); "
        f"$bitmap.Save('{str(screenshot_path).replace(\"'\", \"''\")}', [System.Drawing.Imaging.ImageFormat]::Png); "
        "$graphics.Dispose(); "
        "$bitmap.Dispose();"
    )
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
        timeout=15,
    )
    return _safe_json_dumps({
        "path": str(screenshot_path),
        "capturedAt": _utc_now_iso(),
    })


def _system_sleep() -> str:
    if platform.system().lower().startswith("win"):
        subprocess.run(
            ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            timeout=10,
        )
        return "Sleep requested on the local device."
    raise RuntimeError("system_sleep is currently supported only on Windows workers.")


def _read_gpu_metrics() -> list[dict[str, Any]]:
    try:
        raw = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=index,name,temperature.gpu,utilization.gpu,memory.total,memory.free",
                "--format=csv,noheader,nounits",
            ],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
        )
    except Exception:
        return []

    devices: list[dict[str, Any]] = []
    for line in raw.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 6:
            continue
        try:
            devices.append({
                "index": int(parts[0]),
                "name": parts[1],
                "temperatureC": int(parts[2]),
                "utilizationPercent": int(parts[3]),
                "memoryTotalMb": int(parts[4]),
                "memoryFreeMb": int(parts[5]),
            })
        except ValueError:
            continue
    return devices


def _system_status_ping() -> str:
    cpu_percent: float | None = None
    memory: dict[str, Any] = {"totalMb": None, "availableMb": None, "percentUsed": None}

    try:
        import psutil  # type: ignore

        cpu_percent = float(psutil.cpu_percent(interval=0.2))
        vm = psutil.virtual_memory()
        memory = {
            "totalMb": round(float(vm.total) / 1024 / 1024, 2),
            "availableMb": round(float(vm.available) / 1024 / 1024, 2),
            "percentUsed": round(float(vm.percent), 2),
        }
    except Exception:
        if hasattr(os, "getloadavg"):
            try:
                load1, _, _ = os.getloadavg()
                cpu_percent = round(float(load1), 2)
            except Exception:
                cpu_percent = None

    return _safe_json_dumps({
        "platform": platform.platform(),
        "cpuPercent": cpu_percent,
        "memory": memory,
        "gpu": _read_gpu_metrics(),
        "timestamp": _utc_now_iso(),
    })


def _repo_status(config: WorkerConfig, payload: dict[str, Any]) -> str:
    root = _resolve_allowed_path(config, str(payload.get("path") or "."))
    if not root.exists():
        raise RuntimeError(f"Repository path does not exist: {root}")
    if not root.is_dir():
        raise RuntimeError(f"Repository path is not a directory: {root}")
    file_count = 0
    dir_count = 0
    for item in root.rglob("*"):
        if item.is_dir():
            dir_count += 1
        elif item.is_file():
            file_count += 1
    return _safe_json_dumps({
        "path": str(root),
        "files": file_count,
        "directories": dir_count,
    })


def _repo_index(config: WorkerConfig, payload: dict[str, Any]) -> str:
    root = _resolve_allowed_path(config, str(payload.get("path") or "."))
    if not root.exists() or not root.is_dir():
        raise RuntimeError(f"Repository path is invalid: {root}")
    manifest_path = Path(config.allowed_directory).resolve() / ".assistantx-index.json"
    indexed_files = []
    for item in root.rglob("*"):
        if len(indexed_files) >= 500:
            break
        if item.is_file():
            indexed_files.append(str(item.relative_to(root)))
    manifest_path.write_text(
        _safe_json_dumps({
            "root": str(root),
            "indexedAt": _utc_now_iso(),
            "fileCount": len(indexed_files),
            "files": indexed_files,
        }),
        encoding="utf-8",
    )
    return _safe_json_dumps({
        "root": str(root),
        "manifest": str(manifest_path),
        "fileCount": len(indexed_files),
    })


def _update_ignore_rules(config: WorkerConfig, payload: dict[str, Any]) -> str:
    pattern = str(payload.get("pattern") or "").strip()
    if not pattern:
        raise RuntimeError("Ignore pattern is required.")
    ignore_path = Path(config.allowed_directory).resolve() / ".assistantx-ignore"
    existing = ignore_path.read_text(encoding="utf-8", errors="ignore").splitlines() if ignore_path.exists() else []
    if pattern not in existing:
        existing.append(pattern)
        ignore_path.write_text("\n".join(existing) + "\n", encoding="utf-8")
    return _safe_json_dumps({
        "ignoreFile": str(ignore_path),
        "pattern": pattern,
        "entries": existing,
    })


def _db_query(payload: dict[str, Any]) -> str:
    query = str(payload.get("query") or "").strip()
    if not query:
        raise RuntimeError("Database query is required.")
    database_url = os.getenv("LOCAL_WORKER_DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("LOCAL_WORKER_DATABASE_URL is not configured on this local worker.")
    return _safe_json_dumps({
        "query": query,
        "databaseUrlConfigured": True,
        "note": "Database execution is intentionally disabled until a local DB adapter is configured on this worker.",
    })


def handle_system_action(config: WorkerConfig, *, action_type: str | None, payload: dict[str, Any]) -> str:
    if action_type not in ALLOWED_SYSTEM_ACTIONS:
        raise RuntimeError(f"Unsupported system_action '{action_type or ''}'.")

    if action_type == "launch_roblox":
        return _launch_roblox(payload)
    if action_type == "open_app":
        return _open_app(payload)
    if action_type == "system_screenshot":
        return _capture_screenshot()
    if action_type == "system_sleep":
        return _system_sleep()
    if action_type == "system_file_list":
        return _list_allowed_directory(config, payload)
    if action_type == "system_file_read":
        return _read_allowed_file(config, payload)
    if action_type == "system_file_search":
        return _search_allowed_files(config, payload)
    if action_type == "system_status_ping":
        return _system_status_ping()
    if action_type == "system_repo_status":
        return _repo_status(config, payload)
    if action_type == "system_repo_index":
        return _repo_index(config, payload)
    if action_type == "system_ignore_update":
        return _update_ignore_rules(config, payload)
    if action_type == "system_db_query":
        return _db_query(payload)

    raise RuntimeError(f"Unsupported system_action '{action_type or ''}'.")


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
    raw_promp
    t = str(task.get("prompt") or "")
    category = str(task.get("category") or "ai_request")
    action_type = str(task.get("action_type") or "").strip() or None
    payload = _coerce_payload(task.get("payload"))
    if not task_id or not user_id or not raw_prompt:
        return

    output_text = ""
    provider = "local_worker"
    model = action_type or "ai_request"
    routing = "local"
    changed = False
    current_temp = config.default_temperature

    try:
        if category == "system_action":
            output_text = handle_system_action(config, action_type=action_type, payload=payload)
        else:
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
            provider = "ollama"
            model = config.ollama_model

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
                    output_text = generate_with_ollama(
                        config,
                        raw_prompt=raw_prompt,
                        temperature=current_temp,
                        system_instruction=system_instruction,
                    )
            except Exception as local_exc:
                if not route_to_cloud:
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
                else:
                    raise
    except Exception:
        raise

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
    processing_count = supabase.fetch_processing_count()
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
        device_id=config.device_id or None,
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

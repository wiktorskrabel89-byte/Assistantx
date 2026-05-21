from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


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


@dataclass(frozen=True)
class WorkerConfig:
    supabase_url: str
    supabase_key: str
    ollama_base_url: str
    ollama_light_model: str
    ollama_heavy_model: str
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
    searxng_url: str
    action_roots: tuple[str, ...]


def _parse_action_roots() -> tuple[str, ...]:
    raw = os.getenv("LOCAL_SYSTEM_ACTION_ROOTS", "").strip()
    if not raw:
        defaults = [os.path.expanduser("~"), os.getcwd()]
        return tuple(dict.fromkeys(os.path.abspath(path) for path in defaults if path))
    roots = [segment.strip() for segment in raw.split(os.pathsep) if segment.strip()]
    normalized = [os.path.abspath(os.path.expanduser(path)) for path in roots]
    return tuple(dict.fromkeys(normalized))


def load_config() -> WorkerConfig:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or ""
    )
    return WorkerConfig(
        supabase_url=supabase_url.rstrip("/"),
        supabase_key=supabase_key,
        ollama_base_url=(os.getenv("LOCAL_OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/"),
        ollama_light_model=os.getenv("LOCAL_OLLAMA_MODEL") or "qwen2.5:14b",
        ollama_heavy_model=os.getenv("LOCAL_OLLAMA_CODER_MODEL") or "qwen2.5-coder:32b",
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
        searxng_url=(os.getenv("LOCAL_SEARXNG_URL") or "http://127.0.0.1:8080/search").rstrip("/"),
        action_roots=_parse_action_roots(),
    )


class SupabaseRestClient:
    def __init__(self, url: str, service_key: str):
        if not url or not service_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required.")
        self.base_url = url.rstrip("/")
        self.service_key = service_key

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
            "Authorization": f"Bearer {self.service_key}",
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

    def fetch_processing_count(self) -> int:
        rows = self._request(
            "GET",
            "/rest/v1/ai_tasks",
            params={
                "select": "task_id",
                "status": "eq.processing",
                "routing": "eq.local",
            },
        )
        return len(rows or [])

    def fetch_pending_local_tasks(self, *, limit: int = 25) -> list[dict[str, Any]]:
        rows = self._request(
            "GET",
            "/rest/v1/ai_tasks",
            params={
                "select": "task_id,user_id,device_id,prompt,temperature,created_at,status,routing,category,action_type,payload,priority",
                "status": "eq.pending",
                "routing": "eq.local",
                "order": "priority.asc,created_at.asc",
                "limit": str(max(1, limit)),
            },
        )
        return list(rows or [])

    def claim_task(
        self,
        task_id: str,
        *,
        route_to_cloud: bool,
        fallback_reason: str | None = None,
    ) -> dict[str, Any] | None:
        now = _utc_now_iso()
        patch: dict[str, Any] = {
            "status": "processing",
            "started_at": now,
        }
        if route_to_cloud:
            patch["routing"] = "cloud"
            patch["fallback_reason"] = fallback_reason or "cloud_fallback"
        rows = self._request(
            "PATCH",
            "/rest/v1/ai_tasks",
            params={
                "task_id": f"eq.{task_id}",
                "status": "eq.pending",
            },
            body=patch,
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

    def fetch_device(self, device_id: str) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "/rest/v1/devices",
            params={
                "select": "id,user_id,trust_state,label",
                "id": f"eq.{device_id}",
                "limit": "1",
            },
        )
        if not rows:
            return None
        return rows[0]

    def insert_audit_log(
        self,
        *,
        event_type: str,
        user_id: str | None,
        target_type: str | None,
        target_id: str | None,
        payload: dict[str, Any],
    ) -> None:
        self._request(
            "POST",
            "/rest/v1/audit_logs",
            body=[{
                "event_type": event_type,
                "user_id": user_id,
                "target_type": target_type,
                "target_id": target_id,
                "payload": payload,
            }],
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


def generate_with_ollama(
    config: WorkerConfig,
    *,
    model: str,
    raw_prompt: str,
    temperature: float,
    system_instruction: str,
) -> str:
    request_payload = {
        "model": model,
        "prompt": f"{system_instruction}\n\nUżytkownik: {raw_prompt}",
        "stream": False,
        "options": {"temperature": clamp_temperature(temperature)},
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
    task_category = str(task.get("category") or "ai_request").strip().lower()
    if not task_id or not user_id or not raw_prompt:
        return

    if task_category == "system_action":
        device_id = str(task.get("device_id") or "")
        action_type = str(task.get("action_type") or "")
        payload_raw = task.get("payload") or {}
        payload = payload_raw if isinstance(payload_raw, dict) else {}
        if not device_id or not action_type:
            raise RuntimeError("system_action task requires device_id and action_type.")
        device = supabase.fetch_device(device_id)
        if not device or str(device.get("user_id") or "") != user_id:
            raise RuntimeError("Target device not found for system action.")
        if str(device.get("trust_state") or "") != "trusted":
            raise RuntimeError("Target device is not trusted for system action.")

        output_text = execute_system_action(config, action_type, payload)
        supabase.complete_task(
            task_id,
            response_text=output_text,
            provider="local-system",
            model=action_type,
            routing="local",
            fallback_reason=None,
        )
        try:
            supabase.insert_audit_log(
                event_type="system_action_completed",
                user_id=user_id,
                target_type="device",
                target_id=device_id,
                payload={"taskId": task_id, "actionType": action_type},
            )
        except Exception:
            pass
        print(f"[Worker] Completed system_action task={task_id} action={action_type}")
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

    cleaned_prompt, web_context = _extract_web_search_context(config, raw_prompt)
    system_instruction = _build_system_instruction(get_self_code(config.source_code_max_chars), web_context)
    local_model = _choose_local_model(config, cleaned_prompt)

    output_text = ""
    provider = "ollama"
    model = local_model
    routing = "local"

    try:
        if route_to_cloud:
            output_text = generate_with_cloud_fallback(
                config,
                raw_prompt=cleaned_prompt,
                temperature=current_temp,
                system_instruction=system_instruction,
            )
            provider = "openrouter"
            model = config.cloud_model
            routing = "cloud"
        else:
            output_text = generate_with_ollama(
                config,
                model=local_model,
                raw_prompt=cleaned_prompt,
                temperature=current_temp,
                system_instruction=system_instruction,
            )
    except Exception as local_exc:
        if not route_to_cloud:
            print(f"[Worker][warn] Local generation failed for {task_id}, trying cloud fallback: {local_exc}")
            output_text = generate_with_cloud_fallback(
                config,
                raw_prompt=cleaned_prompt,
                temperature=current_temp,
                system_instruction=system_instruction,
            )
            provider = "openrouter"
            model = config.cloud_model
            routing = "cloud"
            fallback_reason = "local_generation_failed"
        else:
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
    pending = supabase.fetch_pending_local_tasks(limit=10)
    if not pending:
        return None, False, None

    for task in pending:
        task_category = str(task.get("category") or "ai_request").strip().lower()
        if task_category == "system_action":
            claimed = supabase.claim_task(
                str(task.get("task_id")),
                route_to_cloud=False,
                fallback_reason=None,
            )
            if claimed:
                return claimed, False, None
            continue
        age_seconds = _seconds_since_created(task)
        fallback = should_force_cloud_fallback(
            config,
            processing_count=processing_count,
            task_age_seconds=age_seconds,
            local_available=local_available,
        )
        fallback_reason = None
        if fallback:
            if not config.openrouter_api_key:
                continue
            if not local_available:
                fallback_reason = "local_runtime_unavailable"
            elif processing_count >= config.local_max_processing:
                fallback_reason = "local_queue_overflow"
            else:
                fallback_reason = "local_timeout"
        claimed = supabase.claim_task(
            str(task.get("task_id")),
            route_to_cloud=fallback,
            fallback_reason=fallback_reason,
        )
        if claimed:
            return claimed, fallback, fallback_reason

    return None, False, None


def run_worker_forever() -> None:
    config = load_config()
    supabase = SupabaseRestClient(config.supabase_url, config.supabase_key)
    print(
        "[Worker] Started with "
        f"local_light_model={config.ollama_light_model} local_heavy_model={config.ollama_heavy_model} "
        f"cloud_model={config.cloud_model} "
        f"max_processing={config.local_max_processing} pick_timeout={config.task_pick_timeout_seconds}s"
    )

    while True:
        try:
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

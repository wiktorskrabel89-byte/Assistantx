from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
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
    ollama_model: str
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
    return WorkerConfig(
        supabase_url=supabase_url.rstrip("/"),
        supabase_key=supabase_key,
        ollama_base_url=(os.getenv("LOCAL_OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/"),
        ollama_model=os.getenv("LOCAL_OLLAMA_MODEL") or "qwen2.5:14b",
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


def _build_system_instruction(source_code: str) -> str:
    return (
        "Jesteś Jarvisem, zaawansowanym asystentem systemowym. Masz pełny wgląd w swój aktualny kod źródłowy "
        "backendu Pythona (Local Worker), na którym teraz pracujesz. Poniżej znajduje się Twój kod. "
        "Użyj go, jeśli użytkownik zapyta o Twoją strukturę, działanie lub poprosi o modyfikację:\n\n"
        f"```python\n{source_code}\n```"
    )


def generate_with_ollama(
    config: WorkerConfig,
    *,
    raw_prompt: str,
    temperature: float,
    system_instruction: str,
) -> str:
    request_payload = {
        "model": config.ollama_model,
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


ALLOWED_SYSTEM_ACTIONS = {
    "launch_roblox",
    "system_file_list",
    "system_status_ping",
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


def handle_system_action(config: WorkerConfig, *, action_type: str | None, payload: dict[str, Any]) -> str:
    if action_type not in ALLOWED_SYSTEM_ACTIONS:
        raise RuntimeError(f"Unsupported system_action '{action_type or ''}'.")

    if action_type == "launch_roblox":
        return _launch_roblox(payload)
    if action_type == "system_file_list":
        return _list_allowed_directory(config, payload)
    if action_type == "system_status_ping":
        return _system_status_ping()

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
    raw_prompt = str(task.get("prompt") or "")
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
    supabase = SupabaseRestClient(config.supabase_url, config.supabase_key)
    print(
        "[Worker] Started with "
        f"local_model={config.ollama_model} cloud_model={config.cloud_model} "
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
                except Exception:
                    pass
            time.sleep(config.poll_interval_seconds)


if __name__ == "__main__":
    run_worker_forever()

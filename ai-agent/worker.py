from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import sys
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
    sandbox_enabled: bool
    sandbox_timeout_seconds: int
    sandbox_max_ram_mb: int
    sandbox_http_probe_port: int


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
        sandbox_enabled=_env_bool("LOCAL_WORKER_SANDBOX_ENABLED", True),
        sandbox_timeout_seconds=max(5, _env_int("LOCAL_WORKER_SANDBOX_TIMEOUT_SECONDS", 15)),
        sandbox_max_ram_mb=max(64, _env_int("LOCAL_WORKER_SANDBOX_MAX_RAM_MB", 256)),
        sandbox_http_probe_port=max(1, _env_int("LOCAL_WORKER_SANDBOX_HTTP_PROBE_PORT", 8080)),
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
                "output": response_text,
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

    def require_approval(
        self,
        task: dict[str, Any],
        *,
        prompt_summary: str,
        proposed_output: str | None = None,
    ) -> None:
        task_id = str(task.get("task_id") or "")
        user_id = str(task.get("user_id") or "")
        action_type = str(task.get("action_type") or "").strip().lower() or None
        safe_output = str(proposed_output or "").strip()
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
                "output": safe_output or None,
                "response": None,
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

    def update_agent_loop_status(self, task_id: str, status: str, logs: str = "") -> None:
        body: dict[str, Any] = {"agent_loop_status": status}
        if logs:
            body["agent_logs"] = logs[:8000]
        try:
            self._request(
                "PATCH",
                "/rest/v1/ai_tasks",
                params={"task_id": f"eq.{task_id}"},
                body=body,
            )
        except Exception as exc:
            print(f"[Worker][warn] update_agent_loop_status failed for {task_id}: {exc}")

    def get_user_plan(self, user_id: str) -> str:
        try:
            rows = self._request(
                "GET",
                "/rest/v1/workspace_states",
                params={
                    "select": "state_json",
                    "user_id": f"eq.{user_id}",
                    "limit": "1",
                },
            )
            if not rows:
                return "free"
            state_json = rows[0].get("state_json") if isinstance(rows[0], dict) else None
            if isinstance(state_json, dict):
                value = str(state_json.get("userPlan") or "").strip().lower()
                if value in {"free", "pro", "pro+"}:
                    return value
            return "free"
        except Exception as exc:
            print(f"[Worker][warn] get_user_plan failed for {user_id}: {exc}")
            return "free"

    def update_task_sandbox_telemetry(
        self,
        task_id: str,
        *,
        sandbox_ram_mb: int | None = None,
        sandbox_boot_ms: int | None = None,
        sandbox_passed: bool | None = None,
        critic_score: int | None = None,
        agent_attempt: int | None = None,
        quota_remaining: int | None = None,
        quota_max: int | None = None,
        token_estimate_k: float | None = None,
    ) -> None:
        body: dict[str, Any] = {}
        if sandbox_ram_mb is not None:
            body["sandbox_ram_mb"] = int(sandbox_ram_mb)
        if sandbox_boot_ms is not None:
            body["sandbox_boot_ms"] = int(sandbox_boot_ms)
        if sandbox_passed is not None:
            body["sandbox_passed"] = bool(sandbox_passed)
        if critic_score is not None:
            body["critic_score"] = int(critic_score)
        if agent_attempt is not None:
            body["agent_attempt"] = max(1, int(agent_attempt))
        if quota_remaining is not None:
            body["quota_remaining"] = int(quota_remaining)
        if quota_max is not None:
            body["quota_max"] = int(quota_max)
        if token_estimate_k is not None:
            body["token_estimate_k"] = float(token_estimate_k)
        if not body:
            return
        self._request(
            "PATCH",
            "/rest/v1/ai_tasks",
            params={"task_id": f"eq.{task_id}"},
            body=body,
        )

    def consume_cloud_agent_quota(self, user_id: str) -> dict[str, Any]:
        rows = self._request(
            "POST",
            "/rest/v1/rpc/consume_cloud_agent_quota",
            body={"p_user_id": user_id},
        )
        if isinstance(rows, list) and rows:
            return dict(rows[0])
        if isinstance(rows, dict):
            return rows
        return {"allowed": False, "uses_today": 0, "max_per_day": 0, "remaining": 0}


_MULTI_AGENT_MAX_FIX_ITERATIONS = 3

_AGENT_STATUS_LABELS: dict[str, str] = {
    "architect": "architect",
    "coder":     "coder",
    "tester":    "tester",
    "sandbox":   "sandbox",
    "reviewer":  "reviewer",
    "critic":    "critic",
    "security":  "security",
    "done":      "done",
}

_SANDBOX_WEB_HINTS = ("http.server", "flask", "fastapi", "express")
_CODE_BLOCK_PATTERN = re.compile(r"```(?P<lang>[a-zA-Z0-9_-]*)\n(?P<code>[\s\S]*?)```", re.MULTILINE)


def _extract_primary_code_block(generated_code: str) -> tuple[str, str]:
    text = str(generated_code or "").strip()
    if not text:
        return "", "txt"
    matches = list(_CODE_BLOCK_PATTERN.finditer(text))
    if not matches:
        return text, "txt"
    chosen = max(matches, key=lambda match: len(match.group("code") or ""))
    language = (chosen.group("lang") or "").strip().lower()
    return (chosen.group("code") or "").strip(), language or "txt"


def _sandbox_runtime_command(language: str, file_path: Path) -> list[str] | None:
    if language in {"py", "python"}:
        return [sys.executable, str(file_path)]
    if language in {"js", "javascript", "node", "ts", "typescript"}:
        return ["node", str(file_path)]
    return None


def _is_web_app_code(code: str) -> bool:
    lowered = str(code or "").lower()
    return any(marker in lowered for marker in _SANDBOX_WEB_HINTS)


def _probe_http_health(port: int, timeout_seconds: int = 8) -> int | None:
    end = time.time() + max(1, timeout_seconds)
    url = f"http://127.0.0.1:{port}/"
    while time.time() < end:
        try:
            req = urllib.request.Request(url=url, method="GET")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                return int(getattr(resp, "status", 200))
        except urllib.error.HTTPError as exc:
            return int(getattr(exc, "code", 500))
        except Exception:
            time.sleep(0.3)
    return None


def execute_in_safe_sandbox(config: WorkerConfig, generated_code: str) -> tuple[bool, str, dict[str, int | None]]:
    code, language = _extract_primary_code_block(generated_code)
    if not code.strip():
        return False, "No executable code found in generated output.", {"ram_mb": 0, "boot_time_ms": 0, "http_status": None}

    suffix = ".py" if language in {"py", "python"} else ".js" if language in {"js", "javascript", "node", "ts", "typescript"} else ".txt"
    command: list[str] | None = None
    logs = ""
    ram_mb = 0
    boot_time_ms = 0
    http_status: int | None = None
    started_at = time.monotonic()
    clean_env = {
        "PATH": os.getenv("PATH", ""),
        "HOME": os.getenv("HOME", ""),
        "TMPDIR": tempfile.gettempdir(),
    }

    with tempfile.TemporaryDirectory(prefix="assistantx-sandbox-") as tmp_dir:
        file_path = Path(tmp_dir) / f"generated{suffix}"
        file_path.write_text(code, encoding="utf-8")
        command = _sandbox_runtime_command(language, file_path)
        if not command:
            return False, f"Unsupported sandbox language: {language}", {"ram_mb": 0, "boot_time_ms": 0, "http_status": None}

        proc = subprocess.Popen(
            command,
            cwd=tmp_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True,
            env=clean_env,
        )
        try:
            time.sleep(0.2)
            boot_time_ms = int((time.monotonic() - started_at) * 1000)

            if psutil is not None and proc.poll() is None:
                time.sleep(2)
                try:
                    proc_info = psutil.Process(proc.pid)
                    ram_mb = int(proc_info.memory_info().rss / (1024 * 1024))
                except Exception:
                    ram_mb = 0

            if _is_web_app_code(code):
                http_status = _probe_http_health(config.sandbox_http_probe_port, timeout_seconds=8)

            if proc.poll() is not None:
                stdout, stderr = proc.communicate(timeout=1)
            else:
                stdout, stderr = proc.communicate(timeout=config.sandbox_timeout_seconds)
            logs = "\n".join(part for part in [stdout.strip(), stderr.strip()] if part).strip()
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate()
            logs = "\n".join(part for part in [stdout.strip(), stderr.strip(), "Sandbox timeout exceeded."] if part).strip()

    passed = True
    if command and command[0] == "node" and "Cannot find module" in logs:
        passed = False
    if "Traceback (most recent call last)" in logs or "Error:" in logs and "Sandbox timeout exceeded." not in logs:
        passed = False
    if ram_mb > config.sandbox_max_ram_mb:
        passed = False
        logs = f"{logs}\nSandbox memory limit exceeded: {ram_mb}MB > {config.sandbox_max_ram_mb}MB".strip()
    if _is_web_app_code(code) and (http_status is None or http_status >= 500):
        passed = False
        logs = f"{logs}\nHTTP health check failed on localhost:{config.sandbox_http_probe_port} (status={http_status}).".strip()

    return passed, logs, {"ram_mb": ram_mb, "boot_time_ms": boot_time_ms, "http_status": http_status}


def parse_critic_score(critic_result: str) -> int | None:
    match = re.search(r"(?im)^\s*SCORE\s*:\s*(10|[1-9])\s*$", str(critic_result or ""))
    if not match:
        return None
    try:
        score = int(match.group(1))
    except ValueError:
        return None
    if score < 1 or score > 10:
        return None
    return score


class MultiAgentOrchestrator:
    """Stateless 4-stage LLM pipeline: Architect → Coder → Tester → Security.

    Uses only existing generate_with_ollama / generate_with_cloud_fallback helpers —
    no external dependencies are required.
    """

    def __init__(
        self,
        config: "WorkerConfig",
        supabase: "SupabaseRestClient",
        task_id: str,
        route_to_cloud: bool = False,
        quota_remaining: int | None = None,
        quota_max: int | None = None,
    ):
        self.config = config
        self.supabase = supabase
        self.task_id = task_id
        self.route_to_cloud = route_to_cloud
        self.quota_remaining = quota_remaining
        self.quota_max = quota_max

    def _update_status(
        self,
        agent_name: str,
        message: str,
        logs: str = "",
        *,
        attempt: int | None = None,
        score: int | None = None,
        quota_remaining: int | None = None,
        quota_max: int | None = None,
        token_estimate_k: float | None = None,
    ) -> None:
        self.supabase.update_agent_loop_status(self.task_id, agent_name, logs)
        payload: dict[str, Any] = {
            "type": "MULTI_AGENT_STATUS",
            "agent": agent_name,
            "message": message,
            "taskId": self.task_id,
        }
        if attempt is not None:
            payload["attempt"] = max(1, int(attempt))
        if score is not None:
            payload["score"] = int(score)
        if quota_remaining is not None:
            payload["quota_remaining"] = int(quota_remaining)
        if quota_max is not None:
            payload["quota_max"] = int(quota_max)
        if token_estimate_k is not None:
            payload["token_estimate_k"] = float(token_estimate_k)
        status_json = json.dumps(payload)
        print(status_json, flush=True)

    def _call_llm(self, system_prompt: str, user_prompt: str, model_hint: str = "light") -> str:
        config = self.config
        temperature = config.default_temperature
        if self.route_to_cloud or not config.local_enabled:
            return generate_with_cloud_fallback(
                config,
                raw_prompt=user_prompt,
                temperature=temperature,
                system_instruction=system_prompt,
            )
        model_name = config.ollama_heavy_model if model_hint == "heavy" else config.ollama_light_model
        keep_alive = _get_keep_alive_for_model(config, model_name)
        return generate_with_ollama(
            config,
            model_name=model_name,
            raw_prompt=user_prompt,
            temperature=temperature,
            system_instruction=system_prompt,
            keep_alive=keep_alive,
        )

    def execute(self, user_prompt: str, codebase_context: str) -> dict[str, Any]:
        # --- STAGE 1: ARCHITECT ---
        self._update_status("architect", "🕵️ Architect is analysing the repository and planning changes...")
        architect_system = (
            "You are a Senior Software Architect. Analyse the provided codebase context and create a "
            "rigorous, step-by-step change plan. Do NOT write final code — focus on file structure, "
            "affected modules, and logic flow. Be precise and concise."
        )
        architect_prompt = f"Codebase context:\n{codebase_context}\n\nTask:\n{user_prompt}"
        plan = self._call_llm(architect_system, architect_prompt, model_hint="light")
        self._update_status("architect", "✅ Architect completed the change plan.", logs=plan)

        coder_system = (
            "You are an expert Software Engineer. Your only task is to implement the plan provided by the "
            "Architect in the given codebase context. Return ONLY the modified/new code wrapped in "
            "appropriate code blocks (```). Do not add explanations outside the code blocks."
        )
        tester_system = (
            "You are a QA Engineer. Analyse the provided code for syntax errors, missing brackets, "
            "incorrect indentation, and obvious logic bugs. "
            "Respond ONLY with the word 'PASSED' if the code is correct, "
            "or start your response with 'FAILED: ' followed by a precise description of every error found."
        )
        reviewer_system = (
            "You are a senior code reviewer. Focus only on logic bugs, anti-patterns, maintainability, naming, "
            "and code quality concerns (not syntax). Reply ONLY with 'PASSED' if good enough, otherwise "
            "start with 'FAILED: ' and provide concise actionable feedback."
        )
        critic_system = (
            "You are a product critic. Compare the implementation with the original user request. "
            "Reply with line 1 exactly as 'SCORE: <1-10>' and then a short report of gaps/improvements."
        )
        security_system = (
            "You are a Chief Security Engineer. Examine the provided code for: "
            "API key or secret leaks, SQL injection vulnerabilities, "
            "arbitrary command execution (e.g. rm -rf, del /f, subprocess with user input), "
            "and path traversal risks. "
            "Respond ONLY with 'SAFE' if no issues are found, "
            "or start with 'DANGER: ' followed by a precise description of every vulnerability."
        )

        generated_code = ""
        score: int | None = None
        last_sandbox_stats: dict[str, int | None] = {"ram_mb": 0, "boot_time_ms": 0, "http_status": None}
        for attempt in range(1, _MULTI_AGENT_MAX_FIX_ITERATIONS + 1):
            self.supabase.update_task_sandbox_telemetry(self.task_id, agent_attempt=attempt)
            self._update_status("coder", "💻 Coder is implementing the architecture plan...", attempt=attempt)
            coder_prompt = f"Codebase context:\n{codebase_context}\n\nArchitect plan:\n{plan}"
            generated_code = self._call_llm(coder_system, coder_prompt, model_hint="heavy")
            self._update_status("coder", f"✅ Coder generated the implementation (attempt {attempt}).", logs=generated_code, attempt=attempt)

            # --- STAGE 3: TESTER ---
            self._update_status("tester", "🧪 Tester is verifying syntax and logic...", attempt=attempt)
            tester_prompt = f"Code to verify:\n{generated_code}"
            tester_result = self._call_llm(tester_system, tester_prompt, model_hint="light")
            if "FAILED" in tester_result.upper():
                plan += f"\n[Tester Feedback]: {tester_result}"
                self._update_status("tester", f"❌ Tester found issues on attempt {attempt}.", logs=tester_result, attempt=attempt)
                continue
            self._update_status("tester", "✅ Tester: code passed quality check.", attempt=attempt)

            # --- STAGE 3.5: SANDBOX ---
            if self.config.sandbox_enabled:
                self._update_status("sandbox", "📦 Sandbox Runner is executing the generated app...", attempt=attempt)
                runtime_passed, runtime_logs, performance_stats = execute_in_safe_sandbox(self.config, generated_code)
                last_sandbox_stats = performance_stats
                self.supabase.update_task_sandbox_telemetry(
                    self.task_id,
                    sandbox_ram_mb=int(performance_stats.get("ram_mb") or 0),
                    sandbox_boot_ms=int(performance_stats.get("boot_time_ms") or 0),
                    sandbox_passed=runtime_passed,
                    agent_attempt=attempt,
                )
                if not runtime_passed:
                    plan += f"\n[Sandbox Runtime Crash Log]: {runtime_logs}\nFix runtime failure."
                    self._update_status("sandbox", f"❌ Sandbox failed on attempt {attempt}.", logs=runtime_logs, attempt=attempt)
                    continue
                self._update_status(
                    "sandbox",
                    f"⚡ Sandbox passed. RAM: {performance_stats.get('ram_mb', 0)}MB, Boot: {performance_stats.get('boot_time_ms', 0)}ms.",
                    logs=runtime_logs,
                    attempt=attempt,
                )

            # --- STAGE 4: REVIEWER ---
            self._update_status("reviewer", "🔍 Reviewer is checking quality and hidden logic bugs...", attempt=attempt)
            reviewer_result = self._call_llm(reviewer_system, f"Code to review:\n{generated_code}", model_hint="light")
            if "FAILED" in reviewer_result.upper():
                plan += f"\n[Reviewer Feedback]: {reviewer_result}"
                self._update_status("reviewer", f"❌ Reviewer rejected attempt {attempt}.", logs=reviewer_result, attempt=attempt)
                continue
            self._update_status("reviewer", "✅ Reviewer approved code quality.", attempt=attempt)

            # --- STAGE 5: CRITIC ---
            self._update_status("critic", "⚖️ Product Critic is scoring fit against user request...", attempt=attempt)
            critic_prompt = f"Original user request:\n{user_prompt}\n\nGenerated code:\n{generated_code}"
            critic_result = self._call_llm(critic_system, critic_prompt, model_hint="light")
            score = parse_critic_score(critic_result)
            if score is None:
                score = 0
            self.supabase.update_task_sandbox_telemetry(self.task_id, critic_score=score, agent_attempt=attempt)
            if score < 8:
                plan += f"\n[Critic Feedback - SCORE {score}/10]: {critic_result}\nImprove implementation."
                self._update_status("critic", f"⚠️ Critic scored {score}/10 on attempt {attempt}; retrying.", logs=critic_result, attempt=attempt, score=score)
                continue
            self._update_status("critic", f"⭐ Critic scored {score}/10.", logs=critic_result, attempt=attempt, score=score)

            # --- STAGE 6: SECURITY ---
            self._update_status("security", "🛡️ Security agent is scanning for vulnerabilities...", attempt=attempt, score=score)
            security_prompt = f"Code to analyse:\n{generated_code}"
            security_result = self._call_llm(security_system, security_prompt, model_hint="light")
            self.supabase.update_agent_loop_status(self.task_id, "done")
            token_estimate_k = round(max(len(generated_code), 1) / 4 / 1000, 2)
            if "SAFE" in security_result.upper() and "DANGER" not in security_result.upper():
                self._update_status(
                    "security",
                    "🔒 Security agent approved the code as safe.",
                    attempt=attempt,
                    score=score,
                    quota_remaining=self.quota_remaining,
                    quota_max=self.quota_max,
                    token_estimate_k=token_estimate_k,
                )
                return {
                    "success": True,
                    "code": generated_code,
                    "reason": None,
                    "score": score,
                    "attempt": attempt,
                    "sandbox_stats": last_sandbox_stats,
                    "token_estimate_k": token_estimate_k,
                }

            self._update_status("security", "🚨 CODE BLOCKED — potential security threat detected!", logs=security_result, attempt=attempt, score=score)
            return {"success": False, "code": generated_code, "reason": security_result, "score": score, "attempt": attempt}

        self.supabase.update_agent_loop_status(self.task_id, "done")
        return {
            "success": False,
            "code": generated_code,
            "reason": (
                f"Loop interrupted after {_MULTI_AGENT_MAX_FIX_ITERATIONS} attempts — human review required."
            ),
            "score": score,
            "sandbox_stats": last_sandbox_stats,
        }


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


def _prompt_blocked_for_free(prompt: str) -> bool:
    lowered = str(prompt or "").lower()
    return any(re.search(pattern, lowered) for pattern in FREE_BLOCKLIST_PATTERNS)


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


def _is_deploy_task(task: dict[str, Any]) -> bool:
    task_type = str(task.get("task_type") or "").strip().lower()
    if task_type == "deploy_request":
        return True
    prompt = str(task.get("prompt") or "").strip().lower()
    return bool(re.search(r"\b(deploy|release|rollout|prod|production|wdroż|wdróż)\b", prompt))


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

FREE_SAFE_SYSTEM_ACTIONS = {
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
}

FREE_BLOCKLIST_PATTERNS = (
    r"\brm\s+-rf\b",
    r"\bmkfs\b",
    r"\bshutdown\b",
    r"\breboot\b",
    r"\bhalt\b",
    r"\bchmod\s+777\b",
    r"\bchown\b",
    r"\buseradd\b",
    r"\buserdel\b",
    r"\bdd\s+if=",
    r"\bcurl\b.*\|\s*sh\b",
    r"\bwget\b.*\|\s*sh\b",
)


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
    escaped_path = str(screenshot_path).replace("'", "''")
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "Add-Type -AssemblyName System.Drawing; "
        "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
        "$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; "
        "$graphics = [System.Drawing.Graphics]::FromImage($bitmap); "
        "$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); "
        f"$bitmap.Save('{escaped_path}', [System.Drawing.Imaging.ImageFormat]::Png); "
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
    raw_prompt = str(task.get("prompt") or "")
    current_status = str(task.get("status") or "").strip().lower()
    category = str(task.get("category") or "ai_request")
    action_type = str(task.get("action_type") or "").strip() or None
    payload = _coerce_payload(task.get("payload"))
    execution_mode = str(task.get("execution_mode") or "direct").strip().lower() or "direct"
    if not task_id or not user_id or not raw_prompt:
        return

    user_plan = supabase.get_user_plan(user_id)
    is_premium_user = user_plan in {"pro", "pro+"}

    if current_status == "approved" and _is_deploy_task(task):
        approved_output = str(task.get("output") or "").strip()
        if not approved_output:
            approved_output = "Deployment approved by user. No staged output payload was stored."
        supabase.complete_task(
            task_id,
            response_text=f"✅ Deployment approved by user.\n\n{approved_output}",
            provider="manual_approval",
            model="deploy-approval-gate",
            routing="local",
            fallback_reason=None,
        )
        return

    output_text = ""
    provider = "local_worker"
    model = action_type or "ai_request"
    routing = "local"
    changed = False
    current_temp = config.default_temperature

    try:
        if category == "system_action":
            if user_plan == "free":
                if action_type not in FREE_SAFE_SYSTEM_ACTIONS:
                    raise RuntimeError(
                        "Ta akcja wymaga zaawansowanej weryfikacji bezpieczeństwa. "
                        "Uruchom ją przez potok 7 Agentów w wersji Pro."
                    )
                if _prompt_blocked_for_free(raw_prompt):
                    raise RuntimeError(
                        "Wykryto potencjalnie niebezpieczne polecenie. "
                        "W planie Free dostępny jest tylko katalog bezpiecznych akcji."
                    )
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

            if user_plan == "free" and _prompt_blocked_for_free(raw_prompt):
                raise RuntimeError(
                    "Ta akcja wymaga zaawansowanej weryfikacji bezpieczeństwa. "
                    "Uruchom ją przez potok 7 Agentów w wersji Pro."
                )

            run_multi_agent = execution_mode == "multi_agent" and is_premium_user
            if execution_mode == "multi_agent" and not is_premium_user:
                print(f"[Worker][info] Downgrading multi-agent request to direct mode for free user {user_id}")

            if run_multi_agent:
                quota_remaining: int | None = None
                quota_max: int | None = None
                if user_plan == "pro":
                    quota_info = supabase.consume_cloud_agent_quota(user_id)
                    allowed = bool(quota_info.get("allowed"))
                    quota_remaining = int(quota_info.get("remaining") or 0)
                    quota_max = int(quota_info.get("max_per_day") or 0)
                    supabase.update_task_sandbox_telemetry(
                        task_id,
                        quota_remaining=quota_remaining,
                        quota_max=quota_max,
                    )
                    if not allowed:
                        supabase.fail_task(
                            task_id,
                            "Daily Pro pipeline quota exhausted (20/20). Upgrade to Pro+ or wait until midnight UTC.",
                        )
                        return

                codebase_context = get_self_code(config.source_code_max_chars)
                if _should_attach_map_code(raw_prompt):
                    map_code = get_map_widget_code(config.source_code_max_chars)
                    if map_code:
                        codebase_context += f"\n\n# --- map-widget.js ---\n{map_code}"

                orchestrator = MultiAgentOrchestrator(
                    config,
                    supabase,
                    task_id,
                    route_to_cloud=route_to_cloud,
                    quota_remaining=quota_remaining,
                    quota_max=quota_max,
                )
                result = orchestrator.execute(raw_prompt, codebase_context)
                if result["success"]:
                    supabase.update_task_sandbox_telemetry(
                        task_id,
                        critic_score=int(result.get("score") or 0) if result.get("score") is not None else None,
                        agent_attempt=int(result.get("attempt") or 1),
                        token_estimate_k=float(result.get("token_estimate_k") or 0.0),
                    )
                    output_text = str(result.get("code") or "")
                    provider = "openrouter_multi_agent" if route_to_cloud else "ollama_multi_agent"
                    model = config.cloud_model if route_to_cloud else config.ollama_heavy_model
                    routing = "cloud" if route_to_cloud else "local"

                    if _is_deploy_task(task):
                        approval_summary = (
                            "✅ Premium pipeline finished. Review the staged deploy output and approve before execution."
                        )
                        supabase.require_approval(
                            task,
                            prompt_summary=approval_summary,
                            proposed_output=output_text,
                        )
                        return
                else:
                    supabase.fail_task(
                        task_id,
                        str(result.get("reason") or "Multi-agent pipeline failed — human review required."),
                    )
                    return
            else:
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

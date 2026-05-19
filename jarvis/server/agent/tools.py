from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import psutil

ALLOWED_SERVICES = {"docker", "nginx", "ollama"}
ALLOWED_SERVICE_ACTIONS = {"start", "stop", "restart", "status"}

SAFE_COMMANDS = {
    "docker_ps": ["docker", "ps", "--format", "{{.Names}}\t{{.Status}}"],
    "ollama_list": ["ollama", "list"],
    "disk_usage": ["df", "-h"],
    "uptime": ["uptime"],
}


def get_allowed_directory() -> Path:
    raw = os.environ.get("JARVIS_ALLOWED_DIRECTORY", "").strip()
    if not raw:
        raise PermissionError("JARVIS_ALLOWED_DIRECTORY is not configured")
    path = Path(raw).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def check_path_safety(path: str | Path) -> Path:
    allowed = get_allowed_directory()
    target = Path(path).expanduser().resolve()
    if target != allowed and allowed not in target.parents:
        raise PermissionError("Attempt to access path outside managed directory")
    return target


async def tool_list_files(directory: str = ".") -> dict[str, Any]:
    base = get_allowed_directory()
    target = check_path_safety(base / directory)
    if not target.exists():
        return {"ok": False, "error": "directory-not-found", "path": str(target)}
    if not target.is_dir():
        return {"ok": False, "error": "not-a-directory", "path": str(target)}

    entries = []
    for entry in sorted(target.iterdir(), key=lambda p: p.name.lower()):
        try:
            stats = entry.stat()
        except OSError:
            continue
        entries.append(
            {
                "name": entry.name,
                "path": str(entry),
                "isDir": entry.is_dir(),
                "size": int(stats.st_size),
                "mtime": int(stats.st_mtime),
            }
        )
    return {"ok": True, "entries": entries, "path": str(target)}


async def tool_delete_file(file_path: str, confirmed: bool = False) -> dict[str, Any]:
    if not confirmed:
        return {"ok": False, "error": "confirmation-required"}

    base = get_allowed_directory()
    target = check_path_safety(base / file_path)
    if not target.exists():
        return {"ok": False, "error": "path-not-found", "path": str(target)}

    if target.is_file():
        target.unlink()
        return {"ok": True, "message": f"Deleted file: {target.name}"}

    shutil.rmtree(target)
    return {"ok": True, "message": f"Deleted directory: {target.name}"}


async def tool_manage_service(service_name: str, action: str) -> dict[str, Any]:
    service = str(service_name or "").strip()
    op = str(action or "").strip()
    if service not in ALLOWED_SERVICES:
        return {"ok": False, "error": "service-not-allowed"}
    if op not in ALLOWED_SERVICE_ACTIONS:
        return {"ok": False, "error": "action-not-allowed"}

    command = ["sudo", "systemctl", op, service]
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    payload = {
        "ok": proc.returncode == 0,
        "service": service,
        "action": op,
        "stdout": stdout.decode("utf-8", errors="ignore").strip(),
        "stderr": stderr.decode("utf-8", errors="ignore").strip(),
        "returnCode": proc.returncode,
    }
    return payload


def _netdata_metrics() -> dict[str, Any]:
    netdata_url = os.environ.get("JARVIS_NETDATA_URL", "http://netdata:19999").rstrip("/")
    endpoint = f"{netdata_url}/api/v1/data?chart=system.cpu&format=json&points=1&group=average&options=ms"
    request = Request(endpoint, headers={"accept": "application/json"})
    with urlopen(request, timeout=3) as response:
        raw = response.read().decode("utf-8", errors="ignore")
    parsed = json.loads(raw)
    cpu_percent = 0.0
    rows = parsed.get("data") or []
    labels = parsed.get("labels") or []
    if rows and labels:
        row = rows[-1]
        if isinstance(row, list) and len(row) >= 2:
            values = [float(v) for v in row[1:] if isinstance(v, (int, float))]
            cpu_percent = max(0.0, min(100.0, sum(values)))
    return {"cpuPercent": round(cpu_percent, 2), "source": "netdata"}


def _gpu_memory_gb() -> float:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            check=True,
            capture_output=True,
            text=True,
        )
        values = [float(line.strip() or 0) for line in result.stdout.splitlines() if line.strip()]
        if not values:
            return 0.0
        return round(sum(values) / 1024, 2)
    except Exception:
        return 0.0


async def tool_get_metrics() -> dict[str, Any]:
    try:
        netdata = await asyncio.to_thread(_netdata_metrics)
        cpu_percent = float(netdata.get("cpuPercent", 0.0))
        source = netdata.get("source", "netdata")
    except Exception:
        cpu_percent = float(psutil.cpu_percent(interval=0.1))
        source = "psutil"

    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    vram_gb = await asyncio.to_thread(_gpu_memory_gb)

    return {
        "ok": True,
        "source": source,
        "cpu": round(cpu_percent, 2),
        "ram": {
            "percent": round(float(memory.percent), 2),
            "total": int(memory.total),
            "used": int(memory.used),
        },
        "disk": {
            "percent": round(float(disk.percent), 2),
            "free": int(disk.free),
            "total": int(disk.total),
        },
        "vram": round(vram_gb, 2),
    }


async def tool_exec_safe(command: str) -> dict[str, Any]:
    key = str(command or "").strip()
    argv = SAFE_COMMANDS.get(key)
    if not argv:
        return {"ok": False, "error": "command-not-allowed", "allowed": sorted(SAFE_COMMANDS.keys())}

    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return {
        "ok": proc.returncode == 0,
        "command": key,
        "stdout": stdout.decode("utf-8", errors="ignore").strip(),
        "stderr": stderr.decode("utf-8", errors="ignore").strip(),
        "returnCode": proc.returncode,
    }


TOOLS = {
    "list_files": tool_list_files,
    "delete_file": tool_delete_file,
    "manage_service": tool_manage_service,
    "get_metrics": tool_get_metrics,
    "exec_safe": tool_exec_safe,
}

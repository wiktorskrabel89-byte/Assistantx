# Jarvis Power Guard

Windows-only helper that intercepts shutdown intent and requests hibernation (`shutdown /h`) so Wake-on-LAN remains available.

## Build

```powershell
cd /home/runner/work/Assistantx/Assistantx/jarvis/power-guard
cargo build --release
```

## Escape hatch

Set `JARVIS_POWER_GUARD_DISABLED=1` before launch to disable the guard without uninstalling it.

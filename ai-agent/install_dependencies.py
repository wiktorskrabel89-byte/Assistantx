#!/usr/bin/env python3
"""
Install Python dependencies with progress reporting.
Used by jarvis/desktop setup to show progress on splash screen.
"""
import sys
import subprocess
import os
import json
from pathlib import Path

def report_progress(percent: int, message: str = ""):
    """Report progress to stdout (IPC will parse this)."""
    data = {"progress": min(100, max(0, percent))}
    if message:
        data["message"] = message
    print(json.dumps(data), flush=True)

def install_requirements(requirements_file: str = "requirements.txt", report_fn=None):
    """Install requirements from a file."""
    if not report_fn:
        report_fn = report_progress

    req_path = Path(requirements_file)
    if not req_path.exists():
        print(f"ERROR: Requirements file not found: {requirements_file}", file=sys.stderr)
        return 1

    report_fn(5, "Reading requirements…")

    try:
        with open(req_path) as f:
            packages = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    except Exception as e:
        print(f"ERROR: Failed to read requirements: {e}", file=sys.stderr)
        return 1

    if not packages:
        report_fn(100, "No packages to install")
        return 0

    total = len(packages)
    report_fn(10, f"Installing {total} packages…")

    failed = []
    for i, package in enumerate(packages):
        progress = 10 + int((i / total) * 80)
        report_fn(progress, f"Installing {package.split('==')[0].split('[')[0]}…")

        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", package, "--quiet"],
                check=True,
                capture_output=True,
                timeout=60
            )
        except subprocess.CalledProcessError as e:
            failed.append((package, str(e)))
            print(f"WARNING: Failed to install {package}: {e}", file=sys.stderr)
        except subprocess.TimeoutExpired:
            failed.append((package, "timeout"))
            print(f"WARNING: Timeout installing {package}", file=sys.stderr)

    report_fn(95, "Finalizing installation…")

    if failed:
        print(f"WARNING: {len(failed)} package(s) failed to install:", file=sys.stderr)
        for pkg, err in failed:
            print(f"  - {pkg}: {err}", file=sys.stderr)

    report_fn(100, "Installation complete" if not failed else "Installation complete with warnings")
    return 0 if not failed else 1


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Install Python dependencies with progress reporting")
    parser.add_argument("--requirements", default="requirements.txt", help="Path to requirements.txt")
    parser.add_argument("--quiet", action="store_true", help="No progress reporting")
    args = parser.parse_args()

    if args.quiet:
        sys.exit(install_requirements(args.requirements, lambda p, m="": None))
    else:
        sys.exit(install_requirements(args.requirements))

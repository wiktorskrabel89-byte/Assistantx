from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

try:
    import git  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    git = None


class JarvisGitManager:
    def __init__(self, repo_path: str, token: str | None = None):
        self.repo_path = Path(repo_path).resolve()
        self.token = (token or "").strip()
        if not self.repo_path.exists():
            raise ValueError(f"Repository path does not exist: {self.repo_path}")
        if git is not None:
            self.repo = git.Repo(str(self.repo_path))
        else:
            self.repo = None

    def _run(self, args: list[str]) -> str:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(self.repo_path),
            check=True,
            capture_output=True,
            text=True,
        )
        return (proc.stdout or proc.stderr or "").strip()

    def create_branch(self, branch_name: str) -> str:
        if not branch_name.strip():
            raise ValueError("branch_name is required")
        if self.repo is not None:
            new_branch = self.repo.create_head(branch_name)
            new_branch.checkout()
        else:
            self._run(["checkout", "-b", branch_name])
        return f"Branch {branch_name} created and checked out."

    def commit_all_changes(self, message: str) -> str:
        msg = message.strip() or "chore: update files"
        if self.repo is not None:
            self.repo.git.add(A=True)
            if self.repo.is_dirty(untracked_files=True):
                self.repo.index.commit(msg)
                return "All changes staged and committed successfully."
            return "No changes to commit."
        self._run(["add", "-A"])
        try:
            self._run(["commit", "-m", msg])
            return "All changes staged and committed successfully."
        except subprocess.CalledProcessError as exc:
            output = (exc.stdout or "") + (exc.stderr or "")
            if "nothing to commit" in output.lower():
                return "No changes to commit."
            raise

    def get_diff_summary(self, max_lines: int = 400) -> str:
        diff = self._run(["diff", "--stat", "--patch"])
        lines = diff.splitlines()
        if len(lines) > max_lines:
            return "\n".join(lines[:max_lines]) + "\n...[truncated]"
        return diff or "No local diff."

    def current_branch(self) -> str:
        if self.repo is not None:
            return str(self.repo.active_branch.name)
        return self._run(["branch", "--show-current"])


def execute_git_core_action(action: str, payload: dict[str, Any]) -> dict[str, Any]:
    repo_path = str(payload.get("repoPath") or payload.get("repo_path") or os.getcwd())
    token = str(payload.get("token") or "")
    manager = JarvisGitManager(repo_path=repo_path, token=token)
    normalized = str(action or "").strip().lower()

    if normalized == "create_branch":
        branch_name = str(payload.get("branchName") or payload.get("branch_name") or "").strip()
        return {"ok": True, "result": manager.create_branch(branch_name)}
    if normalized == "commit_all_changes":
        message = str(payload.get("message") or "").strip()
        return {"ok": True, "result": manager.commit_all_changes(message)}
    if normalized == "get_diff_summary":
        max_lines = int(payload.get("maxLines") or payload.get("max_lines") or 400)
        return {"ok": True, "result": manager.get_diff_summary(max_lines=max_lines)}
    if normalized == "current_branch":
        return {"ok": True, "result": manager.current_branch()}

    return {"ok": False, "error": f"Unsupported git_core action: {normalized}"}

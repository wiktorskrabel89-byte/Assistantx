from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pathspec

SUPPORTED_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".cs",
    ".php",
    ".rb",
    ".swift",
    ".kt",
}


@dataclass
class CodeChunk:
    id: str
    repo: str
    path: str
    start_line: int
    end_line: int
    content: str


def _safe_repo_dirname(repo_url: str) -> str:
    digest = hashlib.sha1(repo_url.encode("utf-8")).hexdigest()[:12]
    name = re.sub(r"[^a-zA-Z0-9._-]+", "-", repo_url.rsplit("/", 1)[-1]).strip("-")
    return f"{name or 'repo'}-{digest}"


def clone_or_update_repo(repo_url: str, root_dir: str, token: str | None = None) -> Path:
    repo_url = str(repo_url or "").strip()
    if not repo_url:
        raise ValueError("repo_url is required")
    authenticated_url = repo_url
    if token and repo_url.startswith("https://"):
        authenticated_url = repo_url.replace("https://", f"https://{token}@", 1)
    repo_dir = Path(root_dir) / _safe_repo_dirname(repo_url)
    repo_dir.parent.mkdir(parents=True, exist_ok=True)
    if (repo_dir / ".git").exists():
        subprocess.run(["git", "-C", str(repo_dir), "pull", "--ff-only"], check=True)
    else:
        subprocess.run(["git", "clone", authenticated_url, str(repo_dir)], check=True)
    return repo_dir


def _normalize_gitignore_pattern(pattern: str, base_relative: str) -> str:
    stripped = pattern.strip()
    if not stripped or stripped.startswith("#"):
        return stripped

    negated = stripped.startswith("!")
    body = stripped[1:] if negated else stripped
    anchored = body.startswith("/")
    body = body.lstrip("/")

    if not base_relative:
        normalized = f"/{body}" if anchored else body
        return f"!{normalized}" if negated else normalized

    if anchored:
        normalized = f"{base_relative}/{body}" if body else base_relative
    elif "/" in body:
        normalized = f"{base_relative}/{body}"
    else:
        normalized = f"{base_relative}/**/{body}"

    return f"!{normalized}" if negated else normalized


def _load_gitignore_spec(repo_dir: Path) -> pathspec.PathSpec:
    combined_patterns: list[str] = []
    for gitignore_path in sorted(repo_dir.rglob(".gitignore")):
        if any(part == ".git" for part in gitignore_path.parts):
            continue
        try:
            lines = gitignore_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except Exception:
            continue
        base_relative = gitignore_path.parent.relative_to(repo_dir).as_posix()
        combined_patterns.extend(
            _normalize_gitignore_pattern(line, base_relative)
            for line in lines
        )
    return pathspec.PathSpec.from_lines("gitignore", combined_patterns)


def _is_ignored(path: Path, repo_dir: Path, ignore_spec: pathspec.PathSpec, *, is_dir: bool = False) -> bool:
    relative = path.relative_to(repo_dir).as_posix()
    if is_dir and relative:
        relative = f"{relative}/"
    return bool(relative) and ignore_spec.match_file(relative)


def _iter_code_files(repo_dir: Path, ignore_spec: pathspec.PathSpec | None = None) -> Iterable[Path]:
    ignore_spec = ignore_spec or pathspec.PathSpec.from_lines("gitignore", [])
    for root, dirs, files in os.walk(repo_dir):
        root_path = Path(root)
        dirs[:] = [
            d for d in dirs
            if d not in {".git", "node_modules", ".next", "__pycache__", "dist", "build"}
            and not _is_ignored(root_path / d, repo_dir, ignore_spec, is_dir=True)
        ]
        for file_name in files:
            path = root_path / file_name
            if _is_ignored(path, repo_dir, ignore_spec):
                continue
            if path.suffix.lower() in SUPPORTED_EXTENSIONS:
                yield path


def _chunk_lines(text: str, max_lines: int = 80, overlap: int = 12) -> list[tuple[int, int, str]]:
    lines = text.splitlines()
    if not lines:
        return []
    chunks: list[tuple[int, int, str]] = []
    step = max(1, max_lines - overlap)
    for start in range(0, len(lines), step):
        end = min(len(lines), start + max_lines)
        segment = "\n".join(lines[start:end]).strip()
        if not segment:
            continue
        chunks.append((start + 1, end, segment))
        if end == len(lines):
            break
    return chunks


def build_index(repo_dir: Path, index_dir: Path, *, max_lines: int = 80, overlap: int = 12) -> dict[str, int]:
    index_dir.mkdir(parents=True, exist_ok=True)
    chunks_file = index_dir / "chunks.jsonl"
    total_files = 0
    total_chunks = 0
    ignore_spec = _load_gitignore_spec(repo_dir)
    with chunks_file.open("w", encoding="utf-8") as handle:
        for file_path in _iter_code_files(repo_dir, ignore_spec=ignore_spec):
            total_files += 1
            relative = str(file_path.relative_to(repo_dir)).replace("\\", "/")
            try:
                source = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for idx, (start_line, end_line, content) in enumerate(_chunk_lines(source, max_lines=max_lines, overlap=overlap)):
                chunk = CodeChunk(
                    id=f"{relative}:{start_line}:{idx}",
                    repo=repo_dir.name,
                    path=relative,
                    start_line=start_line,
                    end_line=end_line,
                    content=content,
                )
                handle.write(json.dumps(chunk.__dict__, ensure_ascii=False) + "\n")
                total_chunks += 1
    meta = {
        "repo_dir": str(repo_dir),
        "files_indexed": total_files,
        "chunks_indexed": total_chunks,
    }
    (index_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def _score_chunk(query_terms: set[str], chunk_text: str) -> int:
    words = set(re.findall(r"[a-zA-Z0-9_]{2,}", chunk_text.lower()))
    return len(query_terms & words)


def search_index(index_dir: Path, query: str, *, top_k: int = 3) -> list[dict]:
    query_terms = set(re.findall(r"[a-zA-Z0-9_]{2,}", str(query or "").lower()))
    if not query_terms:
        return []
    chunks_file = index_dir / "chunks.jsonl"
    if not chunks_file.exists():
        return []

    scored: list[tuple[int, dict]] = []
    with chunks_file.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            chunk = json.loads(line)
            score = _score_chunk(query_terms, chunk.get("content", ""))
            if score <= 0:
                continue
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[: max(1, int(top_k))]]

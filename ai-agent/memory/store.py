from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Any

import numpy as np

from memory.embedder import LocalEmbedder

logger = logging.getLogger(__name__)


class MemoryStore:
    def __init__(self, root_dir: str | None = None) -> None:
        self._root = Path(root_dir or "~/.jarvis/memory/lancedb").expanduser()
        self._root.mkdir(parents=True, exist_ok=True)
        self._embedder = LocalEmbedder()
        self._db = None
        self._table = None
        self._rows: list[dict[str, Any]] = []
        self._load_lancedb()

    def _load_lancedb(self) -> None:
        try:
            import lancedb
            self._db = lancedb.connect(str(self._root))
            schema = [
                {"name": "id", "type": "string"},
                {"name": "text", "type": "string"},
                {"name": "metadata", "type": "string"},
                {"name": "vector", "type": f"list<float>[{self._embedder.dim}]"},
            ]
            table_name = "jarvis_memory"
            if table_name in self._db.table_names():
                self._table = self._db.open_table(table_name)
            else:
                self._table = self._db.create_table(table_name, schema=schema, mode="create")
            logger.info("LanceDB memory store initialized at %s", self._root)
        except Exception as exc:
            self._db = None
            self._table = None
            logger.warning("LanceDB unavailable, using in-memory fallback: %s", exc)

    def upsert(self, text: str, metadata: dict | None = None) -> dict[str, Any]:
        value = str(text or "").strip()
        if not value:
            return {"ok": False, "reason": "empty-text"}
        payload_meta = metadata or {}
        vector = self._embedder.encode([value])[0]
        entry = {
            "id": str(uuid.uuid4()),
            "text": value,
            "metadata": payload_meta,
            "vector": vector,
        }
        if self._table is not None:
            try:
                import json
                self._table.add([{
                    "id": entry["id"],
                    "text": entry["text"],
                    "metadata": json.dumps(payload_meta, ensure_ascii=False),
                    "vector": vector,
                }])
            except Exception as exc:
                logger.warning("LanceDB add failed; caching in memory: %s", exc)
                self._rows.append(entry)
        else:
            self._rows.append(entry)
        return {"ok": True, "id": entry["id"]}

    def search(self, query_text: str, top_k: int = 5) -> list[dict[str, Any]]:
        query = str(query_text or "").strip()
        if not query:
            return []
        top_k = max(1, min(int(top_k or 5), 20))
        vector = np.asarray(self._embedder.encode([query])[0], dtype=np.float32)

        if self._table is not None:
            try:
                records = self._table.search(vector.tolist()).limit(top_k).to_list()
                results = []
                for row in records:
                    metadata = row.get("metadata")
                    if isinstance(metadata, str):
                        import json
                        try:
                            metadata = json.loads(metadata)
                        except Exception:
                            metadata = {"raw": metadata}
                    results.append({
                        "id": row.get("id"),
                        "text": row.get("text", ""),
                        "metadata": metadata if isinstance(metadata, dict) else {},
                    })
                if results:
                    return results
            except Exception as exc:
                logger.warning("LanceDB search failed, using in-memory fallback: %s", exc)

        if not self._rows:
            return []
        scored = []
        for row in self._rows:
            item_vector = np.asarray(row.get("vector", []), dtype=np.float32)
            if item_vector.size == 0:
                continue
            score = float(np.dot(item_vector, vector) / ((np.linalg.norm(item_vector) or 1.0) * (np.linalg.norm(vector) or 1.0)))
            scored.append((score, row))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            {"id": row["id"], "text": row["text"], "metadata": row.get("metadata", {})}
            for _, row in scored[:top_k]
        ]


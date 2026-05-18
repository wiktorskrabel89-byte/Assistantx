from __future__ import annotations

import hashlib
import logging
from typing import Iterable

import numpy as np

logger = logging.getLogger(__name__)


class LocalEmbedder:
    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5") -> None:
        self._model = None
        self._dim = 384
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(model_name, device="cpu")
            probe = self._model.encode(["probe"], normalize_embeddings=True)
            if len(probe) and hasattr(probe[0], "__len__"):
                self._dim = len(probe[0])
            logger.info("SentenceTransformer embedder loaded: %s", model_name)
        except Exception as exc:
            logger.warning("SentenceTransformer unavailable, using hash embeddings: %s", exc)
            self._model = None

    @property
    def dim(self) -> int:
        return self._dim

    def encode(self, texts: Iterable[str]) -> list[list[float]]:
        values = [str(text or "") for text in texts]
        if not values:
            return []
        if self._model is not None:
            embeddings = self._model.encode(values, normalize_embeddings=True)
            return [np.asarray(vector, dtype=np.float32).tolist() for vector in embeddings]
        return [_hash_embedding(text, self._dim) for text in values]


def _hash_embedding(text: str, dim: int) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    arr = np.zeros(dim, dtype=np.float32)
    for index in range(dim):
        arr[index] = digest[index % len(digest)] / 255.0
    norm = np.linalg.norm(arr) or 1.0
    return (arr / norm).tolist()


from __future__ import annotations

import os
import time
from dataclasses import dataclass

import jwt


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class AuthConfig:
    issuer: str = "jarvis-desktop"
    algorithm: str = "HS256"


def _load_sync_key() -> str:
    direct = os.environ.get("JARVIS_SYNC_KEY", "").strip()
    if direct:
        return direct

    key_file = os.environ.get("JARVIS_SYNC_KEY_FILE", "").strip()
    if not key_file:
        raise AuthError("sync-key-not-configured")
    if not os.path.exists(key_file):
        raise AuthError("sync-key-file-missing")

    key = open(key_file, "r", encoding="utf-8").read().strip()
    if not key:
        raise AuthError("sync-key-empty")
    return key


def validate_jwt(token: str, config: AuthConfig | None = None) -> dict:
    if not token:
        raise AuthError("token-required")

    cfg = config or AuthConfig()
    sync_key = _load_sync_key()

    try:
        payload = jwt.decode(
            token,
            sync_key,
            algorithms=[cfg.algorithm],
            issuer=cfg.issuer,
            options={"require": ["exp", "iat", "iss"]},
        )
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"invalid-token:{exc}") from exc

    iat = int(payload.get("iat", 0))
    exp = int(payload.get("exp", 0))
    now = int(time.time())
    if iat > now + 30:
        raise AuthError("token-issued-in-future")
    if exp <= now:
        raise AuthError("token-expired")

    return payload

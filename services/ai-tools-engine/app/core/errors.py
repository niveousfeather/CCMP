from __future__ import annotations

import re


_WINDOWS_PATH_RE = re.compile(r"[A-Za-z]:[\\/][^\s\"'<>]+")
_POSIX_PATH_RE = re.compile(r"/(?:Users|home|var|tmp|mnt|opt|srv)/[^\s\"'<>]+")
_SECRET_NAME_RE = re.compile(r"[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*", re.I)
_BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._-]+", re.I)


def sanitize_message(value: object, max_length: int = 300) -> str:
    text = str(value or "Unknown error")
    text = _WINDOWS_PATH_RE.sub("[local-path]", text)
    text = _POSIX_PATH_RE.sub("[local-path]", text)
    text = _SECRET_NAME_RE.sub("[sensitive-config]", text)
    text = _BEARER_RE.sub("[bearer-token]", text)
    text = re.sub(r"\bAuthorization\b", "[auth-header]", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_length]

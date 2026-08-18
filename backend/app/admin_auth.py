"""Admin session auth and per-folder visibility rules.

Admin folders (``folders.is_admin = true``) are a private workspace: they and
everything hanging off them — videos, failed URLs, download statuses — must be
invisible to callers without an admin session, not merely hidden in the UI.
Guessing a folder UUID must not reveal anything either, so every folder- and
video-scoped route resolves access through the helpers here instead of
trusting the client.

Non-admin callers touching admin content get **404, not 403** — a 403 would
confirm the resource exists.
"""

import secrets
import time
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException

from app.config import settings
from app.supabase import supabase

# Sessions live in memory only — same tradeoff as the download job store in
# downloads.py. A backend restart signs the admin out, which is fine for a
# single-user personal tool and avoids persisting anything sensitive.
_TOKEN_TTL_SECONDS = 12 * 60 * 60
_tokens: dict[str, float] = {}


def _prune() -> None:
    now = time.monotonic()
    for token in [t for t, expiry in _tokens.items() if expiry <= now]:
        _tokens.pop(token, None)


def verify_password(password: str) -> bool:
    """Constant-time password check. Always False when no password is configured."""
    expected = settings.ADMIN_PASSWORD
    if not expected:
        return False
    return secrets.compare_digest(password, expected)


def issue_token() -> str:
    _prune()
    token = secrets.token_urlsafe(32)
    _tokens[token] = time.monotonic() + _TOKEN_TTL_SECONDS
    return token


def revoke_token(token: str | None) -> None:
    if token:
        _tokens.pop(token, None)


def is_admin(x_admin_token: Annotated[str | None, Header()] = None) -> bool:
    """FastAPI dependency — True when the caller holds a live admin session."""
    if not x_admin_token:
        return False
    _prune()
    return x_admin_token in _tokens


# Routes take this instead of calling is_admin() directly.
AdminFlag = Annotated[bool, Depends(is_admin)]


def folder_is_admin(folder_id: UUID | str) -> bool | None:
    """True/False for the folder's admin flag, or None when it doesn't exist."""
    response = (
        supabase.table("folders")
        .select("is_admin")
        .eq("id", str(folder_id))
        .execute()
    )
    if not response.data:
        return None
    return bool(response.data[0].get("is_admin"))


def assert_folder_visible(folder_id: UUID | str, admin: bool, *, label: str = "Folder") -> None:
    """Raise 404 unless the caller may see this folder."""
    flag = folder_is_admin(folder_id)
    if flag is None or (flag and not admin):
        raise HTTPException(status_code=404, detail=f"{label} not found")


def assert_video_visible(video_id: UUID | str, admin: bool) -> None:
    """Raise 404 unless the caller may see the folder this video belongs to."""
    response = (
        supabase.table("videos")
        .select("folder_id")
        .eq("id", str(video_id))
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Video not found")
    assert_folder_visible(response.data[0]["folder_id"], admin, label="Video")

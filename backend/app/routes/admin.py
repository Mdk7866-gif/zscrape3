import logging
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from app import admin_auth

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


class AdminLoginRequest(BaseModel):
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    token: str


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(body: AdminLoginRequest):
    if not admin_auth.verify_password(body.password):
        logger.warning("Rejected admin login attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    return AdminLoginResponse(success=True, token=admin_auth.issue_token())


@router.post("/logout")
def admin_logout(x_admin_token: Annotated[str | None, Header()] = None):
    admin_auth.revoke_token(x_admin_token)
    return {"success": True}


@router.get("/session")
def admin_session(admin: admin_auth.AdminFlag):
    """Lets the frontend check whether a stored token is still live after a reload."""
    return {"admin": admin}

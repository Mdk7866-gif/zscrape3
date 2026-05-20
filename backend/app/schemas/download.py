from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class StartDownloadRequest(BaseModel):
    video_id: UUID


class DownloadStartResponse(BaseModel):
    success: bool
    job_id: str
    video_id: UUID
    status: str


class DownloadProgressResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    progress: float
    downloaded_bytes: int | None = None
    total_bytes: int | None = None
    eta: int | None = None
    speed: float | None = None
    filename: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class CancelDownloadResponse(BaseModel):
    success: bool
    job_id: str
    status: str

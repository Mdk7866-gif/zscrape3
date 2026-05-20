from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BulkVideoUploadRequest(BaseModel):
    folder_id: UUID
    urls: list[str] = Field(min_length=1)


class VideoOut(BaseModel):
    id: UUID
    folder_id: UUID
    title: str
    duration_seconds: int
    url: str
    platform: str
    thumbnail: str | None = None
    upload_date: date | None = None
    created_at: datetime
    updated_at: datetime


class VideoDeleteResponse(BaseModel):
    success: bool
    deleted: bool
    video_id: UUID


class BulkVideoItem(BaseModel):
    raw_url: str
    cleaned_url: str | None = None
    success: bool
    is_duplicate: bool = False
    inserted_id: UUID | None = None
    title: str | None = None
    platform: str | None = None
    thumbnail: str | None = None
    error: str | None = None


class BulkVideoUploadResponse(BaseModel):
    success: bool
    folder_id: UUID
    total: int
    saved: int
    duplicates: int
    failed: int
    results: list[BulkVideoItem]

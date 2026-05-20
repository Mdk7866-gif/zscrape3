from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FailedUrlOut(BaseModel):
    id: UUID
    folder_id: UUID
    url: str
    created_at: datetime


class FailedUrlDeleteResponse(BaseModel):
    success: bool
    deleted: bool
    failed_url_id: UUID

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class FolderOut(BaseModel):
    id: UUID
    name: str
    is_admin: bool = False
    created_at: datetime
    updated_at: datetime
    last_activity: str


class FolderDeleteResponse(BaseModel):
    success: bool
    deleted: bool
    folder_id: UUID

from pydantic import BaseModel, Field


class UrlCheckerRequest(BaseModel):
    urls: list[str] = Field(min_length=1)


class UrlCheckItem(BaseModel):
    raw_url: str
    cleaned_url: str | None = None
    valid: bool
    reason: str | None = None


class UrlCheckerResponse(BaseModel):
    success: bool
    total: int
    corrected_count: int
    failed_count: int
    items: list[UrlCheckItem]


class ChatRequest(BaseModel):
    query: str


class ChatResponse(BaseModel):
    urls: list[str]

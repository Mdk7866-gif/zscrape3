from fastapi import APIRouter
from app.routes import (
   chatgpturlchecker,
   downloads,
   failed_urls,
   folders,
   videos,
)

api_router = APIRouter()

api_router.include_router(chatgpturlchecker.router)
api_router.include_router(downloads.router)
api_router.include_router(failed_url.router)
api_router.include_router(folders.router)
api_router.include_router(videos.router)


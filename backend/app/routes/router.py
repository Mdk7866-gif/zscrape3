from fastapi import APIRouter
from app.routes import (
   admin,
   chatgpturlchecker,
   downloads,
   failed_urls,
   crudfolders,
   crudvideos,
   proxy,
   video_download_status,
)

api_router = APIRouter()

api_router.include_router(admin.router)
api_router.include_router(chatgpturlchecker.router)
api_router.include_router(downloads.router)
api_router.include_router(failed_urls.router)
api_router.include_router(crudfolders.router)
api_router.include_router(crudvideos.router)
api_router.include_router(proxy.router)
api_router.include_router(video_download_status.router)

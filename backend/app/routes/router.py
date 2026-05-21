from fastapi import APIRouter
from app.routes import (
   chatgpturlchecker,
   downloads,
   failed_urls,
   crudfolders,
   crudvideos,
   proxy,
)

api_router = APIRouter()

api_router.include_router(chatgpturlchecker.router)
api_router.include_router(downloads.router)
api_router.include_router(failed_urls.router)
api_router.include_router(crudfolders.router)
api_router.include_router(crudvideos.router)
api_router.include_router(proxy.router)

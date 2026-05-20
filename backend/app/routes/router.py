from fastapi import APIRouter
from app.routes import (
   demoroute1,
   demoroute2
)

api_router = APIRouter()

api_router.include_router(demoroute1.router)
api_router.include_router(demoroute2.router)


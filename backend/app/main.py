from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.db.connection import connect_to_mongo, close_mongo, get_db
from app.routes.router import api_router

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB
    await connect_to_mongo()
    print("Database connected")
    yield
    # Shutdown: Close connection
    await close_mongo()
    print("Database disconnected")

app = FastAPI(title="FarmHelp API", lifespan=lifespan)

# CORS (Cross-Origin Resource Sharing)
# allowing all origins for now to ensure it works easily
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the main router
app.include_router(api_router)

@app.get("/")
async def root():
    return {"message": "Welcome to FarmHelp API"}

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "database": settings.DATABASE_NAME,
    }

@app.get("/test-db")
async def test(db: AsyncIOMotorDatabase = Depends(get_db)):
    collections = await db.list_collection_names()
    return {"collections": collections}


def start():
    """Launched with `uv run dev` at root level"""
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)


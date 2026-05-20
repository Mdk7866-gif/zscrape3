# /backend/app/db/connection.py

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import get_settings

settings = get_settings()

client: AsyncIOMotorClient | None = None
database: AsyncIOMotorDatabase | None = None


async def connect_to_mongo() -> None:
    global client, database
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    database = client[settings.DATABASE_NAME]


async def close_mongo() -> None:
    if client:
        client.close()


def get_db() -> AsyncIOMotorDatabase:
    if database is None:
        raise RuntimeError("Database not connected")
    return database

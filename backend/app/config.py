# /backend/app/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App / CORS
    FRONTEND_URL: str

    # Database
    MONGODB_URI: str
    DATABASE_NAME: str

    # Cloudinary
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str

    # Telegram
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_CHAT_ID: str

  

    # Admin
    ADMIN_PANEL_PASSWORD: str

    # Pydantic v2 config
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance.
    Prevents re-reading env vars multiple times.
    """
    return Settings()

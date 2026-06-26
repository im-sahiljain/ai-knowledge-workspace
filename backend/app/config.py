from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Database ──
    DATABASE_URL: str

    # ── Redis ──
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Qdrant ──
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "document_chunks"

    # ── Google Gemini ──
    GEMINI_API_KEY: str
    GEMINI_EMBEDDING_MODEL: str = "models/gemini-embedding-2"
    GEMINI_CHAT_MODEL: str = "gemini-2.0-flash"

    # ── Cloudinary ──
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str

    # ── JWT Auth ──
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Upload ──
    MAX_UPLOAD_SIZE_MB: int = 50

    # ── RAG ──
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    TOP_K_RESULTS: int = 5

    # ── CORS ──
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

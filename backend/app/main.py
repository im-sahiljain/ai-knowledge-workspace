import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, documents, collections, chat, search

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="AI Knowledge Workspace",
    description="AI-powered knowledge management platform with RAG",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(collections.router)
app.include_router(chat.router)
app.include_router(search.router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/")
def root():
    return {"message": "AI Knowledge Workspace API", "docs": "/docs"}

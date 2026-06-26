from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


# ═══════════════════════════ AUTH ═══════════════════════════

class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenRefresh(BaseModel):
    refresh_token: str


# ═══════════════════════════ DOCUMENTS ═══════════════════════════

class DocumentResponse(BaseModel):
    id: UUID
    original_filename: str
    file_size: Optional[int] = None
    page_count: Optional[int] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int


# ═══════════════════════════ COLLECTIONS ═══════════════════════════

class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None


class CollectionResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    document_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CollectionDocumentAction(BaseModel):
    document_ids: list[UUID]


# ═══════════════════════════ CONVERSATIONS ═══════════════════════════

class ConversationCreate(BaseModel):
    title: Optional[str] = "New Conversation"
    collection_id: Optional[UUID] = None


class ConversationResponse(BaseModel):
    id: UUID
    title: str
    collection_id: Optional[UUID] = None
    message_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CitationSchema(BaseModel):
    document_name: str
    document_id: str
    page_number: Optional[int] = None
    content: str
    score: Optional[float] = None


class MessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    citations: Optional[list[CitationSchema]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    document_ids: Optional[list[UUID]] = None
    collection_id: Optional[UUID] = None


class ChatResponse(BaseModel):
    user_message: MessageResponse
    assistant_message: MessageResponse
    sources: list[CitationSchema]


class ConversationDetailResponse(BaseModel):
    id: UUID
    title: str
    collection_id: Optional[UUID] = None
    messages: list[MessageResponse]
    created_at: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════ SEARCH ═══════════════════════════

class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    collection_id: Optional[UUID] = None
    document_ids: Optional[list[UUID]] = None
    top_k: int = Field(default=10, ge=1, le=50)


class SearchResultItem(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    page_number: Optional[int] = None
    content: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    query: str
    total: int


# ═══════════════════════════ GENERAL ═══════════════════════════

class HealthResponse(BaseModel):
    status: str
    version: str


class ErrorResponse(BaseModel):
    detail: str

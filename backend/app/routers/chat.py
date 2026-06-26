from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Document, Conversation, Message, Collection
from app.schemas import (
    ConversationCreate,
    ConversationResponse,
    ConversationDetailResponse,
    ChatRequest,
    ChatResponse,
    MessageResponse,
    CitationSchema,
)
from app.core.dependencies import get_current_user
from app.services.ai.rag import generate_answer

router = APIRouter(prefix="/api/v1/chat", tags=["Chat"])


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new conversation."""
    conversation = Conversation(
        user_id=current_user.id,
        title=payload.title or "New Conversation",
        collection_id=payload.collection_id,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return ConversationResponse(
        id=conversation.id,
        title=conversation.title,
        collection_id=conversation.collection_id,
        message_count=0,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all conversations for the current user."""
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return [
        ConversationResponse(
            id=c.id,
            title=c.title,
            collection_id=c.collection_id,
            message_count=len(c.messages),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in conversations
    ]


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a conversation with all its messages."""
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = [
        MessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            citations=[CitationSchema(**c) for c in m.citations] if m.citations else None,
            created_at=m.created_at,
        )
        for m in conversation.messages
    ]

    return ConversationDetailResponse(
        id=conversation.id,
        title=conversation.title,
        collection_id=conversation.collection_id,
        messages=messages,
        created_at=conversation.created_at,
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()


@router.post("/conversations/{conversation_id}/messages", response_model=ChatResponse)
def send_message(
    conversation_id: UUID,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message in a conversation and get an AI-generated response."""
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=payload.content,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Determine which documents to search
    document_ids = None
    if payload.document_ids:
        document_ids = [str(d) for d in payload.document_ids]
    elif payload.collection_id:
        collection = (
            db.query(Collection)
            .filter(Collection.id == payload.collection_id, Collection.user_id == current_user.id)
            .first()
        )
        if collection:
            document_ids = [str(d.id) for d in collection.documents]
    elif conversation.collection_id:
        collection = db.query(Collection).filter(Collection.id == conversation.collection_id).first()
        if collection:
            document_ids = [str(d.id) for d in collection.documents]

    # Build document name mapping for citations
    if document_ids:
        docs = db.query(Document).filter(
            Document.id.in_(document_ids),
            Document.user_id == current_user.id,
            Document.status == "ready",
        ).all()
    else:
        docs = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.status == "ready",
        ).all()

    document_names = {str(d.id): d.original_filename for d in docs}

    if not document_names:
        # No ready documents — save a helpful response
        assistant_message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content="You don't have any processed documents yet. Please upload a PDF and wait for processing to complete before asking questions.",
            citations=None,
        )
        db.add(assistant_message)
        db.commit()
        db.refresh(assistant_message)

        return ChatResponse(
            user_message=MessageResponse.model_validate(user_message),
            assistant_message=MessageResponse.model_validate(assistant_message),
            sources=[],
        )

    # Get conversation history
    history = [
        {"role": m.role, "content": m.content}
        for m in conversation.messages[:-1]  # Exclude the message we just added
    ]

    # Generate answer via RAG
    try:
        result = generate_answer(
            question=payload.content,
            user_id=str(current_user.id),
            document_names=document_names,
            document_ids=list(document_names.keys()) if document_ids else None,
            conversation_history=history,
        )
    except Exception as e:
        error_msg = str(e)
        if "quota" in error_msg.lower() or "rate" in error_msg.lower():
            detail = "Gemini API rate limit exceeded. Please wait a moment and try again."
        elif "api_key" in error_msg.lower() or "authentication" in error_msg.lower():
            detail = "Gemini API key is invalid or missing. Please check your configuration."
        else:
            detail = f"AI service error: {error_msg[:200]}"
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)

    # Save assistant message
    citations_data = [c if isinstance(c, dict) else c.model_dump() for c in result["citations"]]
    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=result["answer"],
        citations=citations_data,
    )
    db.add(assistant_message)

    # Update conversation title if it's the first message
    if len(conversation.messages) <= 2:  # user + assistant
        conversation.title = payload.content[:100]

    db.commit()
    db.refresh(assistant_message)

    return ChatResponse(
        user_message=MessageResponse.model_validate(user_message),
        assistant_message=MessageResponse(
            id=assistant_message.id,
            role=assistant_message.role,
            content=assistant_message.content,
            citations=[CitationSchema(**c) for c in citations_data] if citations_data else None,
            created_at=assistant_message.created_at,
        ),
        sources=[CitationSchema(**c) for c in citations_data] if citations_data else [],
    )

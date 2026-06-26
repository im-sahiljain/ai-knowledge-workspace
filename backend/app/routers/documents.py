from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Document
from app.schemas import DocumentResponse, DocumentListResponse
from app.core.dependencies import get_current_user
from app.config import get_settings
from app.services.cloudinary_service import upload_pdf, delete_pdf
from app.services.ai.embeddings import delete_document_vectors
from app.worker.tasks import process_document_task

settings = get_settings()
router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])

ALLOWED_MIME_TYPES = ["application/pdf"]


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF document. Processing happens asynchronously via Celery."""
    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type: {file.content_type}. Only PDF files are accepted.",
        )

    # Validate file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset

    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB} MB. Your file is {file_size / (1024*1024):.1f} MB.",
        )

    # Upload to Cloudinary
    try:
        cloud_result = upload_pdf(file)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file to cloud storage: {str(e)}",
        )

    # Create document record
    document = Document(
        user_id=current_user.id,
        original_filename=file.filename or "untitled.pdf",
        cloudinary_public_id=cloud_result["public_id"],
        cloudinary_url=cloud_result["secure_url"],
        file_size=file_size,
        status="processing",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # Dispatch Celery task
    task = process_document_task.delay(str(document.id))
    document.celery_task_id = task.id
    db.commit()
    db.refresh(document)

    return DocumentResponse.model_validate(document)


@router.get("", response_model=DocumentListResponse)
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents for the current user."""
    documents = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return DocumentListResponse(
        documents=[DocumentResponse.model_validate(d) for d in documents],
        total=len(documents),
    )


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific document by ID."""
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse.model_validate(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document and all associated data (chunks, vectors, cloud file)."""
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete vectors from Qdrant
    delete_document_vectors(str(document.id))

    # Delete file from Cloudinary
    if document.cloudinary_public_id:
        delete_pdf(document.cloudinary_public_id)

    # Delete from database (cascades to chunks)
    db.delete(document)
    db.commit()


@router.get("/{document_id}/status")
def get_document_status(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll document processing status."""
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "id": str(document.id),
        "status": document.status,
        "error_message": document.error_message,
        "page_count": document.page_count,
    }

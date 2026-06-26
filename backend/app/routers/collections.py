from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Collection, Document, collection_documents
from app.schemas import (
    CollectionCreate,
    CollectionUpdate,
    CollectionResponse,
    CollectionDocumentAction,
    DocumentResponse,
)
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/collections", tags=["Collections"])


def _collection_response(collection: Collection) -> CollectionResponse:
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        document_count=len(collection.documents),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new collection."""
    collection = Collection(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return _collection_response(collection)


@router.get("", response_model=list[CollectionResponse])
def list_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all collections for the current user."""
    collections = (
        db.query(Collection)
        .filter(Collection.user_id == current_user.id)
        .order_by(Collection.created_at.desc())
        .all()
    )
    return [_collection_response(c) for c in collections]


@router.get("/{collection_id}", response_model=CollectionResponse)
def get_collection(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific collection."""
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == current_user.id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return _collection_response(collection)


@router.put("/{collection_id}", response_model=CollectionResponse)
def update_collection(
    collection_id: UUID,
    payload: CollectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a collection's name or description."""
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == current_user.id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    if payload.name is not None:
        collection.name = payload.name
    if payload.description is not None:
        collection.description = payload.description

    db.commit()
    db.refresh(collection)
    return _collection_response(collection)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a collection (documents are NOT deleted, just unlinked)."""
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == current_user.id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    db.delete(collection)
    db.commit()


@router.post("/{collection_id}/documents", response_model=CollectionResponse)
def add_documents_to_collection(
    collection_id: UUID,
    payload: CollectionDocumentAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add documents to a collection."""
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == current_user.id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    for doc_id in payload.document_ids:
        document = (
            db.query(Document)
            .filter(Document.id == doc_id, Document.user_id == current_user.id)
            .first()
        )
        if document and document not in collection.documents:
            collection.documents.append(document)

    db.commit()
    db.refresh(collection)
    return _collection_response(collection)


@router.delete("/{collection_id}/documents", response_model=CollectionResponse)
def remove_documents_from_collection(
    collection_id: UUID,
    payload: CollectionDocumentAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove documents from a collection."""
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == current_user.id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    for doc_id in payload.document_ids:
        document = (
            db.query(Document)
            .filter(Document.id == doc_id, Document.user_id == current_user.id)
            .first()
        )
        if document and document in collection.documents:
            collection.documents.remove(document)

    db.commit()
    db.refresh(collection)
    return _collection_response(collection)


@router.get("/{collection_id}/documents", response_model=list[DocumentResponse])
def get_collection_documents(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents in a collection."""
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == current_user.id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    return [DocumentResponse.model_validate(d) for d in collection.documents]

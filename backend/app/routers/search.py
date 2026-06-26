from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Document, Collection
from app.schemas import SearchRequest, SearchResponse, SearchResultItem
from app.core.dependencies import get_current_user
from app.services.ai.embeddings import search_similar

router = APIRouter(prefix="/api/v1/search", tags=["Search"])


@router.post("", response_model=SearchResponse)
def semantic_search(
    payload: SearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search across all (or filtered) documents using natural language."""
    # Determine document scope
    document_ids = None
    if payload.document_ids:
        document_ids = [str(d) for d in payload.document_ids]
    elif payload.collection_id:
        collection = (
            db.query(Collection)
            .filter(Collection.id == payload.collection_id, Collection.user_id == current_user.id)
            .first()
        )
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        document_ids = [str(d.id) for d in collection.documents]

    # Build document name lookup
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
        return SearchResponse(results=[], query=payload.query, total=0)

    # Search Qdrant
    try:
        results = search_similar(
            query=payload.query,
            user_id=str(current_user.id),
            document_ids=list(document_names.keys()) if document_ids else None,
            top_k=payload.top_k,
        )
    except Exception as e:
        error_msg = str(e)
        if "quota" in error_msg.lower() or "rate" in error_msg.lower():
            raise HTTPException(status_code=503, detail="Gemini API rate limit exceeded. Please wait and try again.")
        raise HTTPException(status_code=503, detail=f"Search service error: {error_msg[:200]}")

    items = []
    for r in results:
        payload_data = r["payload"]
        doc_id = payload_data["document_id"]
        items.append(
            SearchResultItem(
                chunk_id=r["point_id"],
                document_id=doc_id,
                document_name=document_names.get(doc_id, "Unknown"),
                page_number=payload_data.get("page_number"),
                content=payload_data["content"],
                score=round(r["score"], 4),
            )
        )

    return SearchResponse(results=items, query=payload.query, total=len(items))

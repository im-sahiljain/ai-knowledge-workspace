import uuid
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    MatchAny,
)
import time
import google.generativeai as genai

from app.config import get_settings

settings = get_settings()


# Initialize Qdrant client
_qdrant_client = None


def get_qdrant_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        if settings.QDRANT_URL.startswith("http://") or settings.QDRANT_URL.startswith("https://"):
            _qdrant_client = QdrantClient(url=settings.QDRANT_URL)
        else:
            _qdrant_client = QdrantClient(path=settings.QDRANT_URL)
    return _qdrant_client


def ensure_collection_exists():
    """Create the Qdrant collection if it doesn't exist, or recreate it if the dimension is wrong."""
    client = get_qdrant_client()
    try:
        info = client.get_collection(settings.QDRANT_COLLECTION)
        # Check if the size matches our expected 3072 dimension
        vectors_config = info.config.params.vectors
        
        # Handle dict vs object return type across different Qdrant clients
        if isinstance(vectors_config, dict):
            size = vectors_config.get("size")
        else:
            size = getattr(vectors_config, "size", None)
            
        if size != 3072:
            client.delete_collection(settings.QDRANT_COLLECTION)
            client.create_collection(
                collection_name=settings.QDRANT_COLLECTION,
                vectors_config=VectorParams(
                    size=3072,  # gemini-embedding-2 dimension
                    distance=Distance.COSINE,
                ),
            )
    except Exception:
        # Collection does not exist, create it
        try:
            client.create_collection(
                collection_name=settings.QDRANT_COLLECTION,
                vectors_config=VectorParams(
                    size=3072,  # gemini-embedding-2 dimension
                    distance=Distance.COSINE,
                ),
            )
        except Exception:
            pass


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using Gemini with rate limit protection."""
    genai.configure(api_key=settings.GEMINI_API_KEY)
    all_embeddings = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        
        # Retry with exponential backoff if rate limited
        retries = 5
        backoff = 2
        for attempt in range(retries):
            try:
                res = genai.embed_content(
                    model=settings.GEMINI_EMBEDDING_MODEL,
                    content=batch,
                )
                batch_embeddings = res["embedding"]
                all_embeddings.extend(batch_embeddings)
                break
            except Exception as e:
                if attempt == retries - 1:
                    raise e
                time.sleep(backoff)
                backoff *= 2
                
        # Pause slightly between successful batches to respect Free Tier RPM limits
        if i + batch_size < len(texts):
            time.sleep(3.0)
            
    return all_embeddings


def store_embeddings(
    chunks: list[dict],
    embeddings: list[list[float]],
    document_id: str,
    user_id: str,
) -> list[str]:
    """
    Store embeddings in Qdrant with metadata payload.
    Returns list of Qdrant point IDs.
    """
    client = get_qdrant_client()
    ensure_collection_exists()

    points = []
    point_ids = []
    for chunk, embedding in zip(chunks, embeddings):
        point_id = str(uuid.uuid4())
        point_ids.append(point_id)
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "user_id": user_id,
                    "document_id": document_id,
                    "chunk_index": chunk["chunk_index"],
                    "page_number": chunk["page_number"],
                    "content": chunk["content"],
                },
            )
        )

    # Upsert in batches of 100
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(
            collection_name=settings.QDRANT_COLLECTION,
            points=batch,
        )

    return point_ids


def search_similar(
    query: str,
    user_id: str,
    document_ids: Optional[list[str]] = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Search for similar chunks in Qdrant.
    Returns list of {point_id, score, payload} dicts.
    """
    genai.configure(api_key=settings.GEMINI_API_KEY)
    res = genai.embed_content(
        model=settings.GEMINI_EMBEDDING_MODEL,
        content=query,
    )
    query_embedding = res["embedding"]

    client = get_qdrant_client()
    ensure_collection_exists()

    # Build filter: always filter by user_id
    must_conditions = [
        FieldCondition(key="user_id", match=MatchValue(value=user_id))
    ]
    # Optionally filter by specific document IDs
    if document_ids:
        must_conditions.append(
            FieldCondition(key="document_id", match=MatchAny(any=document_ids))
        )

    results = client.query_points(
        collection_name=settings.QDRANT_COLLECTION,
        query=query_embedding,
        query_filter=Filter(must=must_conditions),
        limit=top_k,
        with_payload=True,
    )

    return [
        {
            "point_id": str(point.id),
            "score": point.score,
            "payload": point.payload,
        }
        for point in results.points
    ]


def delete_document_vectors(document_id: str):
    """Delete all vectors associated with a document from Qdrant."""
    client = get_qdrant_client()
    try:
        client.delete(
            collection_name=settings.QDRANT_COLLECTION,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
        )
    except Exception:
        pass  # Collection may not exist yet

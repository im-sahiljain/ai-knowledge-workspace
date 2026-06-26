import logging
import fitz

from app.worker.celery_app import celery_app
from app.database import SessionLocal
from app.models import Document, Chunk
from app.services.cloudinary_service import download_pdf
from app.services.ai.chunking import extract_text_from_pdf, chunk_document
from app.services.ai.embeddings import generate_embeddings, store_embeddings

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
    acks_late=True,
)
def process_document_task(self, document_id: str):
    """
    Full document processing pipeline:
    1. Download PDF from Cloudinary
    2. Extract text from each page
    3. Chunk the text
    4. Generate embeddings via Gemini
    5. Store embeddings in Qdrant
    6. Save chunk records in PostgreSQL
    7. Update document status to 'ready'
    """
    db = SessionLocal()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            logger.error(f"Document {document_id} not found")
            return {"status": "error", "message": "Document not found"}

        # Update status to processing
        document.status = "processing"
        db.commit()

        logger.info(f"Processing document: {document.original_filename}")

        # 1. Download PDF from Cloudinary
        logger.info("Downloading PDF from Cloudinary...")
        pdf_bytes = download_pdf(document.cloudinary_url)

        # Get page count
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        document.page_count = len(pdf_doc)
        pdf_doc.close()
        db.commit()

        # 2. Extract text
        logger.info("Extracting text from PDF...")
        pages = extract_text_from_pdf(pdf_bytes)
        if not pages:
            document.status = "failed"
            document.error_message = "No text could be extracted from this PDF. It may be scanned or image-based."
            db.commit()
            return {"status": "failed", "message": "No text extracted"}

        # 3. Chunk the text
        logger.info("Chunking document...")
        chunks = chunk_document(pages)
        if not chunks:
            document.status = "failed"
            document.error_message = "Document produced no chunks after text splitting."
            db.commit()
            return {"status": "failed", "message": "No chunks produced"}

        logger.info(f"Created {len(chunks)} chunks from {len(pages)} pages")

        # 4. Generate embeddings
        logger.info("Generating embeddings via Gemini...")
        texts = [c["content"] for c in chunks]
        embeddings = generate_embeddings(texts)

        # 5. Store in Qdrant
        logger.info("Storing embeddings in Qdrant...")
        point_ids = store_embeddings(
            chunks=chunks,
            embeddings=embeddings,
            document_id=str(document.id),
            user_id=str(document.user_id),
        )

        # 6. Save chunk records in PostgreSQL
        logger.info("Saving chunk records to database...")
        for chunk_data, point_id in zip(chunks, point_ids):
            chunk_record = Chunk(
                document_id=document.id,
                chunk_index=chunk_data["chunk_index"],
                page_number=chunk_data["page_number"],
                content=chunk_data["content"],
                start_char=chunk_data["start_char"],
                end_char=chunk_data["end_char"],
                qdrant_point_id=point_id,
            )
            db.add(chunk_record)

        # 7. Update status
        document.status = "ready"
        document.error_message = None
        db.commit()

        logger.info(f"Document {document.original_filename} processed successfully")
        return {
            "status": "ready",
            "chunks": len(chunks),
            "pages": len(pages),
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error processing document {document_id}: {str(e)}")
        # Update document status to failed
        try:
            document = db.query(Document).filter(Document.id == document_id).first()
            if document:
                document.status = "failed"
                document.error_message = f"Processing failed: {str(e)[:500]}"
                db.commit()
        except Exception:
            pass
        raise  # Re-raise for Celery retry
    finally:
        db.close()

import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings

settings = get_settings()


def extract_text_from_pdf(pdf_bytes: bytes) -> list[dict]:
    """
    Extract text from PDF bytes page by page.
    Returns a list of {page_number, text} dicts.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text("text")
        if text.strip():
            pages.append({
                "page_number": page_num + 1,  # 1-indexed
                "text": text.strip(),
            })
    doc.close()
    return pages


def chunk_document(pages: list[dict]) -> list[dict]:
    """
    Split extracted pages into chunks using LangChain RecursiveCharacterTextSplitter.
    Returns a list of {chunk_index, page_number, content, start_char, end_char} dicts.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = []
    chunk_index = 0
    cumulative_offset = 0

    for page in pages:
        page_text = page["text"]
        page_number = page["page_number"]

        page_chunks = splitter.split_text(page_text)

        char_offset = 0
        for chunk_text in page_chunks:
            start_char = cumulative_offset + char_offset
            end_char = start_char + len(chunk_text)

            chunks.append({
                "chunk_index": chunk_index,
                "page_number": page_number,
                "content": chunk_text,
                "start_char": start_char,
                "end_char": end_char,
            })
            chunk_index += 1
            # Find where this chunk starts in the page text for accurate offset
            pos = page_text.find(chunk_text, char_offset)
            if pos != -1:
                char_offset = pos + len(chunk_text)
            else:
                char_offset += len(chunk_text)

        cumulative_offset += len(page_text)

    return chunks

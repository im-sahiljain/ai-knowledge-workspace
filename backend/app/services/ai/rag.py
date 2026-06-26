from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate

from app.config import get_settings
from app.services.ai.embeddings import search_similar

settings = get_settings()

SYSTEM_PROMPT = """You are an intelligent AI research assistant for the AI Knowledge Workspace.
Your job is to answer the user's question based ONLY on the provided context from their uploaded documents.

Rules:
1. Answer ONLY based on the provided context. Do NOT use external knowledge.
2. If the context doesn't contain enough information, say "I couldn't find enough information in your documents to answer this question."
3. For EVERY claim, cite the source using [Source N] notation where N is the source number.
4. Be concise but thorough. Use bullet points for clarity when appropriate.
5. If multiple sources discuss the same topic, synthesize the information and cite all relevant sources.
6. Maintain a professional, helpful tone."""

CONTEXT_TEMPLATE = """Context from your documents:

{sources}

---

{history_section}

Question: {question}

Answer (remember to cite sources using [Source N]):"""


def build_context(search_results: list[dict], document_names: dict[str, str]) -> tuple[str, list[dict]]:
    """
    Build formatted context string from search results.
    Returns (formatted_context, citations_list).
    """
    sources_text = ""
    citations = []

    for i, result in enumerate(search_results, 1):
        payload = result["payload"]
        doc_id = payload["document_id"]
        doc_name = document_names.get(doc_id, "Unknown Document")
        page_num = payload.get("page_number", "N/A")
        content = payload["content"]
        score = result.get("score", 0)

        sources_text += f"[Source {i}] Document: \"{doc_name}\" (Page {page_num})\n{content}\n\n"

        citations.append({
            "document_name": doc_name,
            "document_id": doc_id,
            "page_number": page_num,
            "content": content[:500],  # Truncate for response
            "score": round(score, 4) if score else None,
        })

    return sources_text, citations


def generate_answer(
    question: str,
    user_id: str,
    document_names: dict[str, str],
    document_ids: Optional[list[str]] = None,
    conversation_history: Optional[list[dict]] = None,
    top_k: int = None,
) -> dict:
    """
    Full RAG pipeline: search → build context → generate answer.
    Returns {answer, citations, sources_used}.
    """
    if top_k is None:
        top_k = settings.TOP_K_RESULTS

    # 1. Search for relevant chunks
    search_results = search_similar(
        query=question,
        user_id=user_id,
        document_ids=document_ids,
        top_k=top_k,
    )

    if not search_results:
        return {
            "answer": "I couldn't find any relevant information in your documents. Make sure you have uploaded and processed documents related to your question.",
            "citations": [],
            "sources_used": 0,
        }

    # 2. Build context
    sources_text, citations = build_context(search_results, document_names)

    # 3. Build conversation history section
    history_section = ""
    if conversation_history:
        history_lines = []
        # Include last 6 messages for context
        recent = conversation_history[-6:]
        for msg in recent:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_lines.append(f"{role}: {msg['content'][:500]}")
        history_section = "Previous conversation:\n" + "\n".join(history_lines) + "\n\n---\n"

    # 4. Build prompt
    prompt_text = CONTEXT_TEMPLATE.format(
        sources=sources_text,
        history_section=history_section,
        question=question,
    )

    # 5. Call Gemini
    llm = ChatGoogleGenerativeAI(
        model=settings.GEMINI_CHAT_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.3,
        max_output_tokens=2048,
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{input}"),
    ])

    chain = prompt | llm
    response = chain.invoke({"input": prompt_text})

    return {
        "answer": response.content,
        "citations": citations,
        "sources_used": len(search_results),
    }

import cloudinary
import cloudinary.uploader
import httpx
from fastapi import UploadFile

from app.config import get_settings

settings = get_settings()

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


def upload_pdf(file: UploadFile) -> dict:
    """Upload a PDF file to Cloudinary. Returns {public_id, secure_url}."""
    result = cloudinary.uploader.upload(
        file.file,
        resource_type="raw",
        folder="ai-knowledge-workspace",
        format="pdf",
    )
    return {
        "public_id": result["public_id"],
        "secure_url": result["secure_url"],
    }


def download_pdf(url: str) -> bytes:
    """Download a PDF from a Cloudinary URL. Returns the raw bytes."""
    response = httpx.get(url, timeout=120.0)
    response.raise_for_status()
    return response.content


def delete_pdf(public_id: str) -> bool:
    """Delete a file from Cloudinary by its public_id."""
    try:
        result = cloudinary.uploader.destroy(public_id, resource_type="raw")
        return result.get("result") == "ok"
    except Exception:
        return False

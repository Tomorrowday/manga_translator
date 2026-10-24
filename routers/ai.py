# routers/ai.py
# AI роутер: MangaOCR (распознавание) без внешнего Gemini API

import os
from fastapi import APIRouter
from PIL import Image

from database import get_db
from schemas import OcrRequest
from services.ocr import ocr_image_region

router = APIRouter(prefix="/api", tags=["AI"])


@router.post("/ocr")
async def perform_ocr(req: OcrRequest):
    """Распознавание японского текста (MangaOCR) по координатам с учётом угла поворота."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM pages WHERE id = ?", (req.page_id,))
        row = cursor.fetchone()
        conn.close()

        if not row or not os.path.exists(row["file_path"]):
            return {"success": False, "error": "Файл страницы не найден"}

        image = Image.open(row["file_path"]).convert("RGB")
        text = ocr_image_region(
            image,
            req.x,
            req.y,
            req.width,
            req.height,
            rotation=req.rotation or 0.0
        )

        return {"success": True, "text": text}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/translate")
async def translate_text_stub():
    """Заглушка: перевод вынесен на клиент (Ollama) и в раздельный JSON-экспорт."""
    return {
        "success": False,
        "error": "Облачный перевод отключен. Используйте Export JSON для Claude/ChatGPT или локальную Ollama."
    }


@router.post("/translate/batch")
async def translate_batch_stub():
    """Заглушка пакетного перевода."""
    return {"success": False, "translations": {}}
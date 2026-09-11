import os
from fastapi import APIRouter
from PIL import Image

from database import get_db
from schemas import OcrRequest, TranslationRequest, BatchTranslationRequest
from services.ocr import ocr_image_region
from services.translator import translate_single_text, translate_batch_items

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
async def translate_text(req: TranslationRequest):
    try:
        translated = translate_single_text(req.text, title_description=req.title_description or "")
        return {"success": True, "original": req.text, "translated": translated}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/translate/batch")
async def translate_batch(req: BatchTranslationRequest):
    try:
        title_description = req.title_description or ""
        glossary_rows = []

        if req.page_id:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT t.id as title_id, t.description 
                FROM pages p
                JOIN chapters c ON c.id = p.chapter_id
                JOIN titles t ON t.id = c.title_id
                WHERE p.id = ?
                """,
                (req.page_id,)
            )
            t_row = cursor.fetchone()
            if t_row:
                if not title_description and t_row["description"]:
                    title_description = t_row["description"]
                cursor.execute(
                    "SELECT jap_word, rus_word, context FROM glossary WHERE title_id = ?",
                    (t_row["title_id"],)
                )
                glossary_rows = [dict(r) for r in cursor.fetchall()]
            conn.close()

        translations = translate_batch_items(
            req.items,
            title_description=title_description,
            glossary_rows=glossary_rows
        )
        return {"success": True, "translations": translations}
    except Exception as e:
        return {"success": False, "error": str(e)}
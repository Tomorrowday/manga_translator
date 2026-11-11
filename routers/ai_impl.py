# routers/ai_impl.py
# Реализация эндпоинтов AI (MangaOCR распознавание с кэшем последнего изображения страницы)

import os
import threading
from typing import Optional, Tuple
from PIL import Image

from database import get_db
from schemas import OcrRequest
from services.ocr import ocr_image_region

_ocr_cache_lock = threading.Lock()
_cached_page_image: Tuple[Optional[int], Optional[float], Optional[Image.Image]] = (None, None, None)


def _get_cached_page_image(page_id: int, file_path: str) -> Image.Image:
    """Возвращает PIL.Image из кэша, если страница и mtime файла не изменились."""
    global _cached_page_image
    mtime = os.path.getmtime(file_path)

    with _ocr_cache_lock:
        c_id, c_mtime, c_img = _cached_page_image
        if c_id == page_id and c_mtime == mtime and c_img is not None:
            return c_img

    img = Image.open(file_path).convert("RGB")
    with _ocr_cache_lock:
        _cached_page_image = (page_id, mtime, img)
    return img


def perform_ocr(req: OcrRequest):
    """Распознавание японского текста (MangaOCR) по координатам с учётом угла поворота."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT file_path FROM pages WHERE id = ?", (req.page_id,))
            row = cursor.fetchone()

        if not row or not os.path.exists(row["file_path"]):
            return {"success": False, "error": "Файл страницы не найден"}

        image = _get_cached_page_image(req.page_id, str(row["file_path"]))
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


def translate_text_stub():
    """Заглушка: перевод вынесен на клиент (Ollama) и в раздельный JSON-экспорт."""
    return {
        "success": False,
        "error": "Облачный перевод отключен. Используйте Export JSON для Claude/ChatGPT или локальную Ollama."
    }


def translate_batch_stub():
    """Заглушка пакетного перевода."""
    return {"success": False, "translations": {}}
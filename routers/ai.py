# routers/ai.py
"""
Каркас роутера AI (MangaOCR распознавание и заглушки внешнего перевода).
Реализация: routers/ai_impl.py
Зависимости реализации: os, PIL, database.get_db, schemas.OcrRequest, services.ocr.ocr_image_region
"""

from fastapi import APIRouter
from schemas import OcrRequest
import routers.ai_impl as _impl

router = APIRouter(prefix="/api", tags=["AI"])


@router.post("/ocr")
async def perform_ocr(req: OcrRequest):
    """Распознавание японского текста (MangaOCR) по координатам с учётом угла поворота."""
    return await _impl.perform_ocr(req)


@router.post("/translate")
async def translate_text_stub():
    """Заглушка: перевод вынесен на клиент (Ollama) и в раздельный JSON-экспорт."""
    return await _impl.translate_text_stub()


@router.post("/translate/batch")
async def translate_batch_stub():
    """Заглушка пакетного перевода."""
    return await _impl.translate_batch_stub()
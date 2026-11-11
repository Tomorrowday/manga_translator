# routers/ai.py
"""
Каркас роутера AI (MangaOCR распознавание и заглушки внешнего перевода).
Реализация: routers/ai_impl.py
Зависимости реализации: os, threading, PIL, database.get_db, schemas.OcrRequest, services.ocr.ocr_image_region
"""

from fastapi import APIRouter
from schemas import OcrRequest
import routers.ai_impl as _impl

router = APIRouter(prefix="/api", tags=["AI"])


@router.post("/ocr")
def perform_ocr(req: OcrRequest):
    """Распознавание японского текста (MangaOCR) по координатам с учётом угла поворота (выполняется в threadpool)."""
    return _impl.perform_ocr(req)


@router.post("/translate")
def translate_text_stub():
    """Заглушка: перевод вынесен на клиент (Ollama) и в раздельный JSON-экспорт."""
    return _impl.translate_text_stub()


@router.post("/translate/batch")
def translate_batch_stub():
    """Заглушка пакетного перевода."""
    return _impl.translate_batch_stub()
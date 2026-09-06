import io
import time
from fastapi import APIRouter, UploadFile, File
from PIL import Image

from ml.models import ml
from schemas import TranslationRequest, BatchTranslationRequest
from services.detector import detect_and_filter_bubbles
from services.translator import translate_single_text, translate_batch_items

router = APIRouter(prefix="/api", tags=["AI"])


@router.post("/detect")
async def detect_bubbles(file: UploadFile = File(...)):
    """Автодетекция баблов на произвольном загруженном изображении."""
    try:
        start_time = time.time()
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        boxes = detect_and_filter_bubbles(image)
        return {
            "success": True,
            "boxes": boxes,
            "time_seconds": round(time.time() - start_time, 4)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    """Распознавание японского текста (MangaOCR) из кропа бабла."""
    try:
        if ml.mocr is None:
            return {"success": False, "error": "MangaOCR не инициализирована"}

        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        text = ml.mocr(image)
        return {"success": True, "text": text}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/translate")
async def translate_text(req: TranslationRequest):
    """Одиночный перевод текста через Gemini."""
    try:
        translated = translate_single_text(req.text)
        return {"success": True, "original": req.text, "translated": translated}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/translate/batch")
async def translate_batch(req: BatchTranslationRequest):
    """Связный пакетный перевод всех реплик страницы манги."""
    try:
        translations = translate_batch_items(req.items)
        return {"success": True, "translations": translations}
    except Exception as e:
        return {"success": False, "error": str(e)}
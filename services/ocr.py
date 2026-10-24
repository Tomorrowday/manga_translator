# services/ocr.py
"""
Каркас сервиса оптического распознавания японского текста (MangaOCR).
Реализация: services/ocr_impl.py
Зависимости реализации: PIL, math, re, torch, ml.models (ml, release_vram)
"""

from PIL import Image
import services.ocr_impl as _impl


def normalize_ocr_japanese_text(text: str) -> str:
    """Нормализует японскую пунктуацию после распознавания."""
    return _impl.normalize_ocr_japanese_text(text)


def ocr_image_region(
    image: Image.Image,
    x: float,
    y: float,
    width: float,
    height: float,
    rotation: float = 0.0
) -> str:
    """
    Вырезает область бабла (с учетом поворота) и распознает японский текст через MangaOCR.
    Очищает VRAM сразу после вызова.
    """
    return _impl.ocr_image_region(image, x, y, width, height, rotation)
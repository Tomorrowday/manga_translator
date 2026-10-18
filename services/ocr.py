# services/ocr.py
# Модуль распознавания японского текста с поддержкой свободного угла поворота,
# динамического OCR-паддинга и нормализацией пунктуации

import math
import re
from PIL import Image
import torch
from ml.models import ml


def normalize_ocr_japanese_text(text: str) -> str:
    """
    Пост-процессинг текста после MangaOCR:
    - Заменяет ошибочные двоеточия (:, ：) на многоточие (…).
    - Нормализует дублирующиеся знаки.
    """
    if not text:
        return ""

    cleaned = text
    cleaned = re.sub(r'[:：]{2,}', '……', cleaned)
    cleaned = re.sub(r'(?<!\d)[:：](?!\d)', '…', cleaned)
    cleaned = re.sub(r'\.{2,}', '…', cleaned)
    cleaned = re.sub(r'[.…]{2,}', '…', cleaned)
    cleaned = re.sub(r'\s*…\s*', '…', cleaned)

    return cleaned.strip()


def ocr_image_region(
        image: Image.Image,
        x: float,
        y: float,
        width: float,
        height: float,
        rotation: float = 0.0
) -> str:
    """
    Вырезает область бабла с динамическим контекстным паддингом и распознает через MangaOCR
    внутри безопасного контекста torch.inference_mode().
    """
    if ml.mocr is None:
        raise RuntimeError("MangaOCR не инициализирована")

    img_w, img_h = image.size

    cx = (x + width / 2.0) * img_w
    cy = (y + height / 2.0) * img_h
    bw = max(2, int(width * img_w))
    bh = max(2, int(height * img_h))

    # Динамический защитный паддинг: даём MangaOCR 10-18px контекста вокруг рамки
    pad_x = max(8, min(24, int(bw * 0.06)))
    pad_y = max(10, min(28, int(bh * 0.07)))

    # Стандартный кроп без сильного поворота
    if abs(rotation) < 0.5:
        x1 = max(0, int(cx - bw / 2.0) - pad_x)
        y1 = max(0, int(cy - bh / 2.0) - pad_y)
        x2 = min(img_w, int(cx + bw / 2.0) + pad_x)
        y2 = min(img_h, int(cy + bh / 2.0) + pad_y)

        if x2 <= x1 or y2 <= y1:
            return ""

        crop_img = image.crop((x1, y1, x2, y2))
        with torch.inference_mode():
            raw_text = ml.mocr(crop_img).strip()
        return normalize_ocr_japanese_text(raw_text)

    # Повёрнутый бокс
    radius = math.ceil(math.sqrt(bw * bw + bh * bh) / 2.0) + max(pad_x, pad_y) + 4
    sub_x1 = max(0, int(cx - radius))
    sub_y1 = max(0, int(cy - radius))
    sub_x2 = min(img_w, int(cx + radius))
    sub_y2 = min(img_h, int(cy + radius))

    if sub_x2 <= sub_x1 or sub_y2 <= sub_y1:
        return ""

    sub_crop = image.crop((sub_x1, sub_y1, sub_x2, sub_y2))
    local_cx = cx - sub_x1
    local_cy = cy - sub_y1

    rotated_sub = sub_crop.rotate(
        rotation,
        resample=Image.Resampling.BICUBIC,
        center=(local_cx, local_cy),
        fillcolor=(255, 255, 255)
    )

    rx1 = max(0, int(local_cx - bw / 2.0) - pad_x)
    ry1 = max(0, int(local_cy - bh / 2.0) - pad_y)
    rx2 = min(rotated_sub.width, int(local_cx + bw / 2.0) + pad_x)
    ry2 = min(rotated_sub.height, int(local_cy + bh / 2.0) + pad_y)

    if rx2 <= rx1 or ry2 <= ry1:
        return ""

    final_crop = rotated_sub.crop((rx1, ry1, rx2, ry2))
    with torch.inference_mode():
        raw_text = ml.mocr(final_crop).strip()
    return normalize_ocr_japanese_text(raw_text)
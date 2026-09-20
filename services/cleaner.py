# services/cleaner.py
# Интеллектуальный клин баблов (белый клин + LaMa) с поддержкой угла поворота, формы и бесшовного смешивания

import math
from typing import Tuple
import cv2
import numpy as np
from PIL import Image
from ml.models import ml
from config import LAMA_FORCE_GRAYSCALE


def is_patch_monochrome(patch_bgr: np.ndarray, threshold: float = 6.0) -> bool:
    """
    Проверяет, является ли исходный фрагмент чёрно-белым (оттенки серого).
    Вычисляет среднее расхождение между цветовыми каналами B, G и R.
    Если расхождение < threshold, область считается монохромной.
    """
    if patch_bgr.size == 0:
        return True
    b = patch_bgr[:, :, 0].astype(np.int16)
    g = patch_bgr[:, :, 1].astype(np.int16)
    r = patch_bgr[:, :, 2].astype(np.int16)
    diff = np.maximum(np.abs(b - g), np.maximum(np.abs(b - r), np.abs(g - r)))
    return float(np.mean(diff)) < threshold


def is_mostly_white_bubble(roi: np.ndarray, gray: np.ndarray) -> bool:
    """
    Проверка: является ли область чистым белым баблом.
    Если есть признаки арта, скринтона или градиента — возвращает False для ретуши через LaMa.
    """
    total_pixels = gray.size
    if total_pixels == 0:
        return False

    pure_white_ratio = np.mean(gray >= 238)
    if pure_white_ratio < 0.70:
        return False

    midtones_ratio = np.mean((gray >= 70) & (gray <= 215))
    if midtones_ratio > 0.09:
        return False

    light_pixels = gray[gray >= 200]
    if light_pixels.size > 0:
        std_val = np.std(light_pixels)
        if std_val > 12.0:
            return False

    overall_mean = np.mean(gray)
    if overall_mean < 215:
        return False

    return True


def clean_white_bubble_patch(roi: np.ndarray, gray: np.ndarray, shape: str = "rect"):
    """
    Очистка белого бабла на выровненном (upright) кропе:
    удаляет буквы, точки, знаки препинания, сохраняя границу бабла.
    """
    h_roi, w_roi = roi.shape[:2]
    if h_roi < 3 or w_roi < 3:
        return

    _, dark_mask = cv2.threshold(gray, 195, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(dark_mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    text_clean_mask = np.zeros_like(gray)
    border_mask = np.zeros_like(gray)

    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)
        touches_edge = (cx <= 3 or cy <= 3 or (cx + cw) >= w_roi - 3 or (cy + ch) >= h_roi - 3)
        is_large_enclosing_contour = (cw >= w_roi * 0.70 and ch >= h_roi * 0.70)

        if touches_edge or (shape == "ellipse" and is_large_enclosing_contour):
            cv2.drawContours(border_mask, [cnt], -1, 255, thickness=cv2.FILLED)
        else:
            cv2.drawContours(text_clean_mask, [cnt], -1, 255, thickness=cv2.FILLED)

    if np.sum(text_clean_mask) == 0:
        return

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dilated_text = cv2.dilate(text_clean_mask, kernel, iterations=1)

    border_shield = cv2.dilate(border_mask, kernel, iterations=1)
    dilated_text[border_shield == 255] = 0

    roi[dilated_text == 255] = [255, 255, 255]


def inpaint_patch_with_lama(patch_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Вызов нейросети LaMa для выровненного патча с маской.
    Управляется флагом LAMA_FORCE_GRAYSCALE:
    - При LAMA_FORCE_GRAYSCALE=True: принудительно давит цвет в ч/б.
    - При LAMA_FORCE_GRAYSCALE=False: сохраняет сочные цвета для цветной манхвы/вебтунов,
      а для ч/б страниц автоматически подавляет хроматический шум.
    """
    if ml.inpaint_model is None:
        return patch_bgr

    # Дилатация маски для чистого покрытия краев букв
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dilated_mask = cv2.dilate(mask, dilate_kernel, iterations=1)

    crop_rgb = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2RGB)
    crop_pil = Image.fromarray(crop_rgb)
    mask_pil = Image.fromarray(dilated_mask)

    inpainted_pil = ml.inpaint_model(crop_pil, mask_pil)
    inpainted_bgr = cv2.cvtColor(np.array(inpainted_pil), cv2.COLOR_RGB2BGR)

    h, w = patch_bgr.shape[:2]
    if inpainted_bgr.shape[:2] != (h, w):
        inpainted_bgr = cv2.resize(inpainted_bgr, (w, h), interpolation=cv2.INTER_LANCZOS4)

    # Проверка режима цвета: если включен принудительный ч/б или сам кроп монохромен
    if LAMA_FORCE_GRAYSCALE or is_patch_monochrome(patch_bgr):
        inpainted_gray = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2GRAY)
        return cv2.cvtColor(inpainted_gray, cv2.COLOR_GRAY2BGR)

    return inpainted_bgr


def blend_inpainted_patch(
    target_img: np.ndarray,
    inpainted_patch: np.ndarray,
    clean_mask: np.ndarray,
    x1: int, y1: int, x2: int, y2: int
):
    """
    Бесшовное альфа-смешивание (Feathering):
    Заменяет ТОЛЬКО пиксели маски с мягким гауссовым переходом (3px).
    Оригинальные пиксели вокруг бабла остаются нетронутыми на 100%,
    что полностью исключает эффект «съезда линий» и ступени.
    """
    roi_orig = target_img[y1:y2, x1:x2].astype(np.float32)
    roi_inp = inpainted_patch.astype(np.float32)

    k_size = (5, 5)
    dilated = cv2.dilate(clean_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, k_size), iterations=1)
    feathered = cv2.GaussianBlur(dilated.astype(np.float32) / 255.0, (5, 5), 1.2)
    alpha = np.expand_dims(feathered, axis=2)

    blended = roi_orig * (1.0 - alpha) + roi_inp * alpha
    target_img[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)


def get_box_geometry(image_np: np.ndarray, box: dict) -> Tuple[float, float, int, int, float, str]:
    """Извлекает абсолютные геометрические параметры бабла."""
    img_h, img_w = image_np.shape[:2]
    cx = (box["x"] + box["width"] / 2.0) * img_w
    cy = (box["y"] + box["height"] / 2.0) * img_h
    bw = max(4, int(box["width"] * img_w))
    bh = max(4, int(box["height"] * img_h))
    rot = float(box.get("rotation", 0.0) or 0.0)
    shape = box.get("shape", "rect")
    return cx, cy, bw, bh, rot, shape


def clean_speech_bubble(image_np: np.ndarray, box: dict) -> str:
    """
    Единая точка входа для автоматической очистки бабла с поддержкой поворота
    и гарантией отсутствия геометрических искажений фона.
    """
    cx, cy, bw, bh, rot, shape = get_box_geometry(image_np, box)
    img_h, img_w = image_np.shape[:2]

    # Если угол нулевой — быстрый и точный путь
    if abs(rot) < 0.5:
        x1 = max(0, int(cx - bw / 2.0))
        y1 = max(0, int(cy - bh / 2.0))
        x2 = min(img_w, x1 + bw)
        y2 = min(img_h, y1 + bh)

        roi = image_np[y1:y2, x1:x2]
        if roi.size == 0:
            return "skipped"

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        # 1. Белые баблы чистим векторно
        if is_mostly_white_bubble(roi, gray):
            clean_white_bubble_patch(roi, gray, shape=shape)
            image_np[y1:y2, x1:x2] = roi
            return "white"

        # 2. Если требуется LaMa (скринтоны, арт, темный фон)
        if ml.inpaint_model is None:
            clean_white_bubble_patch(roi, gray, shape=shape)
            image_np[y1:y2, x1:x2] = roi
            return "white"

        margin = max(2, int(min(roi.shape[0], roi.shape[1]) * 0.04))
        _, dark_mask = cv2.threshold(gray, 175, 255, cv2.THRESH_BINARY_INV)
        text_clean_mask = np.zeros_like(gray)
        text_clean_mask[margin:-margin, margin:-margin] = dark_mask[margin:-margin, margin:-margin]
        if np.sum(text_clean_mask) < 20:
            text_clean_mask[margin:-margin, margin:-margin] = 255

        pad = max(48, min(140, int(max(bw, bh) * 0.45)))
        cx1 = max(0, x1 - pad)
        cy1 = max(0, y1 - pad)
        cx2 = min(img_w, x2 + pad)
        cy2 = min(img_h, y2 + pad)

        crop_bgr = image_np[cy1:cy2, cx1:cx2].copy()
        crop_mask = np.zeros(crop_bgr.shape[:2], dtype=np.uint8)
        crop_mask[y1 - cy1:y1 - cy1 + roi.shape[0], x1 - cx1:x1 - cx1 + roi.shape[1]] = text_clean_mask

        inpainted = inpaint_patch_with_lama(crop_bgr, crop_mask)
        blend_inpainted_patch(image_np, inpainted, crop_mask, cx1, cy1, cx2, cy2)
        return "inpaint"

    # Повёрнутый бокс
    rad = math.radians(rot)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    src_pts = np.float32([
        [cx - (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (-bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],
        [cx + (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],
        [cx - (bw / 2.0) * cos_a - (bh / 2.0) * sin_a,  cy + (-bw / 2.0) * sin_a + (bh / 2.0) * cos_a]
    ])
    dst_pts = np.float32([[0, 0], [bw, 0], [0, bh]])

    m_extract = cv2.getAffineTransform(src_pts, dst_pts)
    upright_patch = cv2.warpAffine(
        image_np, m_extract, (bw, bh),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )

    gray_patch = cv2.cvtColor(upright_patch, cv2.COLOR_BGR2GRAY)
    used_method = "white"

    if is_mostly_white_bubble(upright_patch, gray_patch):
        clean_white_bubble_patch(upright_patch, gray_patch, shape=shape)
        cleaned_upright = upright_patch
    elif ml.inpaint_model is not None:
        pad = max(40, min(80, int(max(bw, bh) * 0.40)))
        pw = bw + 2 * pad
        ph = bh + 2 * pad

        dst_pts_padded = np.float32([
            [pad, pad],
            [pad + bw, pad],
            [pad, pad + bh]
        ])
        m_extract_padded = cv2.getAffineTransform(src_pts, dst_pts_padded)
        padded_patch = cv2.warpAffine(
            image_np, m_extract_padded, (pw, ph),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )

        pad_gray = cv2.cvtColor(padded_patch, cv2.COLOR_BGR2GRAY)
        margin = max(2, int(min(bw, bh) * 0.04))
        _, dark_mask = cv2.threshold(pad_gray, 175, 255, cv2.THRESH_BINARY_INV)

        clean_mask = np.zeros((ph, pw), dtype=np.uint8)
        clean_mask[pad + margin:pad + bh - margin, pad + margin:pad + bw - margin] = \
            dark_mask[pad + margin:pad + bh - margin, pad + margin:pad + bw - margin]

        if np.sum(clean_mask) < 20:
            clean_mask[pad + margin:pad + bh - margin, pad + margin:pad + bw - margin] = 255

        inpainted_padded = inpaint_patch_with_lama(padded_patch, clean_mask)
        cleaned_upright = inpainted_padded[pad:pad + bh, pad:pad + bw]
        used_method = "inpaint"
    else:
        clean_white_bubble_patch(upright_patch, gray_patch, shape=shape)
        cleaned_upright = upright_patch

    mask_patch = np.zeros((bh, bw), dtype=np.uint8)
    if shape == "ellipse":
        cv2.ellipse(mask_patch, (bw // 2, bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
    else:
        mask_patch.fill(255)

    m_paste = cv2.getAffineTransform(dst_pts, src_pts)
    cleaned_back = cv2.warpAffine(
        cleaned_upright, m_paste, (img_w, img_h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )
    mask_back = cv2.warpAffine(
        mask_patch, m_paste, (img_w, img_h),
        flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )

    image_np[mask_back == 255] = cleaned_back[mask_back == 255]
    return used_method


def spot_clean_region(image_np: np.ndarray, box: dict, method: str = "auto") -> str:
    """
    Точечная очистка области поверх страницы (кнопки White / LaMa в карточке бабла).
    """
    if method == "auto":
        return clean_speech_bubble(image_np, box)

    cx, cy, bw, bh, rot, shape = get_box_geometry(image_np, box)
    img_h, img_w = image_np.shape[:2]

    if abs(rot) < 0.5:
        x1 = max(0, int(cx - bw / 2.0))
        y1 = max(0, int(cy - bh / 2.0))
        x2 = min(img_w, x1 + bw)
        y2 = min(img_h, y1 + bh)

        roi = image_np[y1:y2, x1:x2]
        if roi.size == 0:
            return "skipped"

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        if method == "white" or ml.inpaint_model is None:
            clean_white_bubble_patch(roi, gray, shape=shape)
            image_np[y1:y2, x1:x2] = roi
            return "white"

        pad = max(40, min(100, int(max(bw, bh) * 0.45)))
        cx1 = max(0, x1 - pad)
        cy1 = max(0, y1 - pad)
        cx2 = min(img_w, x2 + pad)
        cy2 = min(img_h, y2 + pad)

        crop_bgr = image_np[cy1:cy2, cx1:cx2].copy()
        crop_mask = np.zeros(crop_bgr.shape[:2], dtype=np.uint8)
        crop_mask[y1 - cy1:y1 - cy1 + roi.shape[0], x1 - cx1:x1 - cx1 + roi.shape[1]] = 255

        inpainted = inpaint_patch_with_lama(crop_bgr, crop_mask)
        blend_inpainted_patch(image_np, inpainted, crop_mask, cx1, cy1, cx2, cy2)
        return "inpaint"

    rad = math.radians(rot)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    src_pts = np.float32([
        [cx - (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (-bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],
        [cx + (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],
        [cx - (bw / 2.0) * cos_a - (bh / 2.0) * sin_a,  cy + (-bw / 2.0) * sin_a + (bh / 2.0) * cos_a]
    ])
    dst_pts = np.float32([[0, 0], [bw, 0], [0, bh]])

    m_extract = cv2.getAffineTransform(src_pts, dst_pts)
    upright_patch = cv2.warpAffine(
        image_np, m_extract, (bw, bh),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )

    gray_patch = cv2.cvtColor(upright_patch, cv2.COLOR_BGR2GRAY)

    if method == "white" or ml.inpaint_model is None:
        clean_white_bubble_patch(upright_patch, gray_patch, shape=shape)
        cleaned_upright = upright_patch
        used_method = "white"
    else:
        pad = max(40, min(80, int(max(bw, bh) * 0.40)))
        pw = bw + 2 * pad
        ph = bh + 2 * pad

        dst_pts_padded = np.float32([[pad, pad], [pad + bw, pad], [pad, pad + bh]])
        m_extract_padded = cv2.getAffineTransform(src_pts, dst_pts_padded)
        padded_patch = cv2.warpAffine(
            image_np, m_extract_padded, (pw, ph),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )

        clean_mask = np.zeros((ph, pw), dtype=np.uint8)
        clean_mask[pad:pad + bh, pad:pad + bw] = 255

        inpainted_padded = inpaint_patch_with_lama(padded_patch, clean_mask)
        cleaned_upright = inpainted_padded[pad:pad + bh, pad:pad + bw]
        used_method = "inpaint"

    mask_patch = np.zeros((bh, bw), dtype=np.uint8)
    if shape == "ellipse":
        cv2.ellipse(mask_patch, (bw // 2, bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
    else:
        mask_patch.fill(255)

    m_paste = cv2.getAffineTransform(dst_pts, src_pts)
    cleaned_back = cv2.warpAffine(
        cleaned_upright, m_paste, (img_w, img_h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )
    mask_back = cv2.warpAffine(
        mask_patch, m_paste, (img_w, img_h),
        flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )

    image_np[mask_back == 255] = cleaned_back[mask_back == 255]
    return used_method


def inpaint_by_brush_mask(image_np: np.ndarray, mask_gray: np.ndarray, mode: str = "lama") -> np.ndarray:
    """
    Обработка мазка кисти:
    - mode == "white": прямое закрашивание маски чистым белым цветом (255, 255, 255).
    - mode == "black": прямое закрашивание маски чистым чёрным цветом (0, 0, 0).
    - mode == "lama": локальный инпейнтинг через нейросеть LaMa с мягким блендингом.
    """
    if mode == "white":
        image_np[mask_gray > 127] = [255, 255, 255]
        return image_np

    if mode == "black":
        image_np[mask_gray > 127] = [0, 0, 0]
        return image_np

    if ml.inpaint_model is None:
        image_np[mask_gray > 127] = [255, 255, 255]
        return image_np

    points = cv2.findNonZero(mask_gray)
    if points is None:
        return image_np

    x, y, w, h = cv2.boundingRect(points)
    img_h, img_w = image_np.shape[:2]

    pad = max(50, min(140, int(max(w, h) * 0.50)))
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(img_w, x + w + pad)
    y2 = min(img_h, y + h + pad)

    crop_bgr = image_np[y1:y2, x1:x2].copy()
    crop_mask = mask_gray[y1:y2, x1:x2]

    inpainted_crop = inpaint_patch_with_lama(crop_bgr, crop_mask)
    blend_inpainted_patch(image_np, inpainted_crop, crop_mask, x1, y1, x2, y2)

    return image_np
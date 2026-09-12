# services/cleaner.py
# Интеллектуальный клин баблов (белый клин + LaMa) с поддержкой угла поворота и формы

import math
from typing import Tuple
import cv2
import numpy as np
from PIL import Image
from ml.models import ml


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
    """Вызов нейросети LaMa для выровненного патча с маской."""
    if ml.inpaint_model is None:
        return patch_bgr

    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dilated_mask = cv2.dilate(mask, dilate_kernel, iterations=1)

    crop_rgb = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2RGB)
    crop_pil = Image.fromarray(crop_rgb)
    mask_pil = Image.fromarray(dilated_mask)

    inpainted_pil = ml.inpaint_model(crop_pil, mask_pil)
    inpainted_bgr = cv2.cvtColor(np.array(inpainted_pil), cv2.COLOR_RGB2BGR)

    h, w = patch_bgr.shape[:2]
    if inpainted_bgr.shape[:2] != (h, w):
        inpainted_bgr = cv2.resize(inpainted_bgr, (w, h))

    inpainted_gray = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(inpainted_gray, cv2.COLOR_GRAY2BGR)


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
    Единая точка входа для автоматической очистки бабла с поддержкой поворота.
    """
    cx, cy, bw, bh, rot, shape = get_box_geometry(image_np, box)
    img_h, img_w = image_np.shape[:2]

    # Если угол нулевой — используем быстрый путь без аффинных трансформаций
    if abs(rot) < 0.5:
        x1 = max(0, int(cx - bw / 2.0))
        y1 = max(0, int(cy - bh / 2.0))
        x2 = min(img_w, x1 + bw)
        y2 = min(img_h, y1 + bh)

        roi = image_np[y1:y2, x1:x2]
        if roi.size == 0:
            return "skipped"

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        if is_mostly_white_bubble(roi, gray):
            clean_white_bubble_patch(roi, gray, shape=shape)
            image_np[y1:y2, x1:x2] = roi
            return "white"

        # LaMa Inpaint
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

        pad = max(40, min(80, int(max(bw, bh) * 0.4)))
        cx1 = max(0, x1 - pad)
        cy1 = max(0, y1 - pad)
        cx2 = min(img_w, x2 + pad)
        cy2 = min(img_h, y2 + pad)

        crop_bgr = image_np[cy1:cy2, cx1:cx2]
        crop_mask = np.zeros(crop_bgr.shape[:2], dtype=np.uint8)
        crop_mask[y1 - cy1:y1 - cy1 + roi.shape[0], x1 - cx1:x1 - cx1 + roi.shape[1]] = text_clean_mask

        inpainted = inpaint_patch_with_lama(crop_bgr, crop_mask)
        image_np[cy1:cy2, cx1:cx2] = inpainted
        return "inpaint"

    # =========================================================================
    # ПОВЕРНУТЫЙ БЛОК (abs(rot) >= 0.5):
    # Выравниваем в горизонталь, чистим, затем возвращаем обратно на угол rot
    # =========================================================================
    rad = math.radians(rot)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    # 3 опорные точки повернутого прямоугольника на исходном изображении
    src_pts = np.float32([
        [cx - (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (-bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],  # TL
        [cx + (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],   # TR
        [cx - (bw / 2.0) * cos_a - (bh / 2.0) * sin_a,  cy + (-bw / 2.0) * sin_a + (bh / 2.0) * cos_a]    # BL
    ])

    dst_pts = np.float32([
        [0, 0],
        [bw, 0],
        [0, bh]
    ])

    # 1. Извлекаем выровненный кроп
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
        # Для арта/скринтонов очищаем через LaMa с контекстным запасом (padding)
        pad = max(30, min(60, int(max(bw, bh) * 0.35)))
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

    # 2. Маска формы (овал или прямоугольник)
    mask_patch = np.zeros((bh, bw), dtype=np.uint8)
    if shape == "ellipse":
        cv2.ellipse(mask_patch, (bw // 2, bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
    else:
        mask_patch.fill(255)

    # 3. Обратное аффинное преобразование: возвращаем очищенный кроп на угол rot
    m_paste = cv2.getAffineTransform(dst_pts, src_pts)
    cleaned_back = cv2.warpAffine(
        cleaned_upright, m_paste, (img_w, img_h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )
    mask_back = cv2.warpAffine(
        mask_patch, m_paste, (img_w, img_h),
        flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )

    # Впечатываем обратно строго в пределы повернутого бабла
    image_np[mask_back == 255] = cleaned_back[mask_back == 255]
    return used_method


def spot_clean_region(image_np: np.ndarray, box: dict, method: str = "auto") -> str:
    """
    Точечная очистка повернутой области поверх страницы:
    - 'white': выбеливание выровненного бабла с защитой контура.
    - 'lama': принудительная ретушь нейросетью LaMa.
    - 'auto': автоматический выбор режима.
    """
    if method == "auto":
        return clean_speech_bubble(image_np, box)

    cx, cy, bw, bh, rot, shape = get_box_geometry(image_np, box)
    img_h, img_w = image_np.shape[:2]

    # Быстрый путь для неповёрнутых боксов
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

        # Принудительная LaMa
        pad = max(30, min(70, int(max(bw, bh) * 0.35)))
        cx1 = max(0, x1 - pad)
        cy1 = max(0, y1 - pad)
        cx2 = min(img_w, x2 + pad)
        cy2 = min(img_h, y2 + pad)

        crop_bgr = image_np[cy1:cy2, cx1:cx2]
        crop_mask = np.zeros(crop_bgr.shape[:2], dtype=np.uint8)
        crop_mask[y1 - cy1:y1 - cy1 + roi.shape[0], x1 - cx1:x1 - cx1 + roi.shape[1]] = 255

        inpainted = inpaint_patch_with_lama(crop_bgr, crop_mask)
        image_np[cy1:cy2, cx1:cx2] = inpainted
        return "inpaint"

    # Повернутый бокс для spot clean
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
        pad = max(30, min(60, int(max(bw, bh) * 0.35)))
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
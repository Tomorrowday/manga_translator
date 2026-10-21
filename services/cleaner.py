# services/cleaner.py
# Интеллектуальный клин баблов (белый клин + LaMa в режиме box) с поддержкой угла поворота, формы и бесшовного смешивания

import gc
import math
from typing import Tuple
import cv2
import numpy as np
from PIL import Image
import torch

from ml.models import ml
from config import LAMA_FORCE_GRAYSCALE, MAX_LAMA_DIM


def release_vram():
    """Принудительно очищает неиспользуемую видеопамять и кэш аллокатора PyTorch."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def load_image_cv2(image_path: str) -> np.ndarray:
    """
    Универсальная безопасная загрузка изображения в формат OpenCV BGR numpy.
    Поддерживает JPG, PNG, WEBP, AVIF, JFIF через Pillow fallback.
    """
    img = cv2.imread(image_path)
    if img is not None:
        return img

    pil_img = Image.open(image_path).convert("RGB")
    rgb_arr = np.array(pil_img)
    return cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)


def is_patch_monochrome(patch_bgr: np.ndarray, threshold: float = 6.0) -> bool:
    """Проверяет, является ли фрагмент чёрно-белым (оттенки серого)."""
    if patch_bgr.size == 0:
        return True
    b = patch_bgr[:, :, 0].astype(np.int16)
    g = patch_bgr[:, :, 1].astype(np.int16)
    r = patch_bgr[:, :, 2].astype(np.int16)
    diff = np.maximum(np.abs(b - g), np.maximum(np.abs(b - r), np.abs(g - r)))
    return float(np.mean(diff)) < threshold


def is_mostly_white_bubble(roi: np.ndarray, gray: np.ndarray) -> bool:
    """
    Проверка для авто-режима: является ли область обычным белым баблом.
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


def _build_bubble_interior_mask(gray: np.ndarray, shape: str = "rect") -> np.ndarray:
    """
    Находит внутреннюю белую область бабла, отсекая углы бокса,
    выходящие за чёрный контур бабла на внешний фон/скринтон.
    Все внутренние петельки в буквах (な, る, 通 и т.д.) принудительно включаются в маску.
    """
    h, w = gray.shape[:2]

    # 1. Выделяем белое полотно бабла (отсекаем черные линии контура и серый скринтон)
    _, white_canvas = cv2.threshold(gray, 215, 255, cv2.THRESH_BINARY)

    # Легкая эрозия гарантирует, что тонкий контур бабла не будет иметь разрывов
    kernel_3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    eroded_white = cv2.erode(white_canvas, kernel_3, iterations=1)

    # 2. Ищем связные белые области
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(eroded_white, connectivity=4)

    # Центральное ядро бокса (где гарантированно находится внутренняя часть бабла)
    cy1, cy2 = int(h * 0.20), max(int(h * 0.20) + 1, int(h * 0.80))
    cx1, cx2 = int(w * 0.20), max(int(w * 0.20) + 1, int(w * 0.80))
    center_labels = np.unique(labels[cy1:cy2, cx1:cx2])

    interior_white = np.zeros_like(gray)
    min_area = (h * w) * 0.05

    for lbl in center_labels:
        if lbl == 0:
            continue
        if stats[lbl, cv2.CC_STAT_AREA] >= min_area:
            interior_white[labels == lbl] = 255

    # Если из-за крупного шрифта белая область распалась, берем самую крупную компоненту в центре
    if np.sum(interior_white) == 0 and num_labels > 1:
        best_lbl = 0
        best_area = 0
        for lbl in center_labels:
            if lbl == 0:
                continue
            area = stats[lbl, cv2.CC_STAT_AREA]
            if area > best_area:
                best_area = area
                best_lbl = lbl
        if best_lbl > 0:
            interior_white[labels == best_lbl] = 255

    if np.sum(interior_white) == 0:
        interior_mask = np.full_like(gray, 255)
    else:
        # Возвращаем 1px после эрозии, но не переходим через темные границы
        interior_white = cv2.dilate(interior_white, kernel_3, iterations=1)
        interior_white[gray < 180] = 0

        # 3. Заполняем все дырки внутри белого острова бабла
        contours, _ = cv2.findContours(interior_white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        interior_mask = np.zeros_like(gray)
        if contours:
            cv2.fillPoly(interior_mask, contours, 255)

        interior_mask = cv2.erode(interior_mask, kernel_3, iterations=1)

    if shape == "ellipse":
        ellipse_mask = np.zeros_like(gray)
        cv2.ellipse(ellipse_mask, (w // 2, h // 2), (w // 2, h // 2), 0, 0, 360, 255, -1)
        interior_mask = cv2.bitwise_and(interior_mask, ellipse_mask)

    return interior_mask


def clean_white_bubble_patch(roi: np.ndarray, gray: np.ndarray, shape: str = "rect"):
    """
    Очистка белого бабла: удаляет буквы (включая замкнутые петельки)
    только внутри контура бабла, сохраняя границы бабла и не обеляя фон/скринтон за его пределами.
    """
    h_roi, w_roi = roi.shape[:2]
    if h_roi < 3 or w_roi < 3:
        return

    interior_mask = _build_bubble_interior_mask(gray, shape=shape)

    _, dark_mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(dark_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    text_clean_mask = np.zeros_like(gray)
    border_mask = np.zeros_like(gray)
    edge_margin = 2

    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)
        touches_edge = (
            cx <= edge_margin or
            cy <= edge_margin or
            (cx + cw) >= w_roi - edge_margin or
            (cy + ch) >= h_roi - edge_margin
        )
        is_large_enclosing_contour = (cw >= w_roi * 0.70 and ch >= h_roi * 0.70)

        if touches_edge or is_large_enclosing_contour:
            cv2.drawContours(border_mask, [cnt], -1, 255, thickness=cv2.FILLED)
            continue

        cnt_mask = np.zeros_like(gray)
        cv2.fillPoly(cnt_mask, [cnt], 255)

        inside_ratio = np.sum((cnt_mask == 255) & (interior_mask == 255)) / float(max(1, np.sum(cnt_mask == 255)))
        if inside_ratio < 0.75:
            cv2.drawContours(border_mask, [cnt], -1, 255, thickness=cv2.FILLED)
            continue

        cv2.fillPoly(text_clean_mask, [cnt], 255)

    if np.sum(text_clean_mask) == 0:
        return

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dilated_text = cv2.dilate(text_clean_mask, kernel, iterations=2)

    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dilated_text = cv2.morphologyEx(dilated_text, cv2.MORPH_CLOSE, close_kernel, iterations=1)

    border_shield = cv2.dilate(border_mask, kernel, iterations=1)
    dilated_text[border_shield == 255] = 0
    dilated_text[interior_mask == 0] = 0

    roi[dilated_text == 255] = [255, 255, 255]


def inpaint_patch_with_lama(patch_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Вызов нейросети LaMa с оптимизацией VRAM:
    - Контекст torch.inference_mode()
    - Пропорциональный ресайз-предохранитель при превышении MAX_LAMA_DIM
    - Очистка памяти после тяжелых фрагментов
    """
    if ml.inpaint_model is None:
        return patch_bgr

    h, w = patch_bgr.shape[:2]
    max_dim = max(h, w)

    need_downscale = max_dim > MAX_LAMA_DIM
    scale_factor = MAX_LAMA_DIM / float(max_dim) if need_downscale else 1.0

    if need_downscale:
        proc_w = max(16, int(round(w * scale_factor)))
        proc_h = max(16, int(round(h * scale_factor)))
        proc_patch = cv2.resize(patch_bgr, (proc_w, proc_h), interpolation=cv2.INTER_AREA)
        proc_mask = cv2.resize(mask, (proc_w, proc_h), interpolation=cv2.INTER_NEAREST)
    else:
        proc_patch = patch_bgr
        proc_mask = mask

    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dilated_mask = cv2.dilate(proc_mask, dilate_kernel, iterations=1)

    crop_rgb = cv2.cvtColor(proc_patch, cv2.COLOR_BGR2RGB)
    crop_pil = Image.fromarray(crop_rgb)
    mask_pil = Image.fromarray(dilated_mask)

    with torch.inference_mode():
        inpainted_pil = ml.inpaint_model(crop_pil, mask_pil)

    inpainted_bgr = cv2.cvtColor(np.array(inpainted_pil), cv2.COLOR_RGB2BGR)

    if inpainted_bgr.shape[:2] != (h, w):
        inpainted_bgr = cv2.resize(inpainted_bgr, (w, h), interpolation=cv2.INTER_LANCZOS4)

    if max_dim >= 768:
        release_vram()

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
    Бесшовное альфа-смешивание (Feathering 3-5px).
    """
    roi_orig = target_img[y1:y2, x1:x2].astype(np.float32)
    roi_inp = inpainted_patch.astype(np.float32)

    dilated = cv2.dilate(clean_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
    feathered = cv2.GaussianBlur(dilated.astype(np.float32) / 255.0, (5, 5), 1.5)
    alpha = np.expand_dims(feathered, axis=2)

    blended = roi_orig * (1.0 - alpha) + roi_inp * alpha
    target_img[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)


def get_box_geometry(image_np: np.ndarray, box: dict) -> Tuple[float, float, int, int, float, str]:
    img_h, img_w = image_np.shape[:2]
    cx = (box["x"] + box["width"] / 2.0) * img_w
    cy = (box["y"] + box["height"] / 2.0) * img_h
    bw = max(4, int(box["width"] * img_w))
    bh = max(4, int(box["height"] * img_h))
    rot = float(box.get("rotation", 0.0) or 0.0)
    shape = box.get("shape", "rect")
    return cx, cy, bw, bh, rot, shape


def clean_speech_bubble(image_np: np.ndarray, box: dict, force_mode: str = "auto") -> str:
    """
    Очистка бабла:
    - force_mode == 'white': принудительно белый клин.
    - force_mode == 'lama': принудительно нейросеть LaMa со сплошной маской бабла (box/ellipse).
    - force_mode == 'auto': автовыбор по типу фона бабла.
    """
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
        use_white = (force_mode == "white") or (force_mode == "auto" and is_mostly_white_bubble(roi, gray))

        if use_white or ml.inpaint_model is None:
            clean_white_bubble_patch(roi, gray, shape=shape)
            image_np[y1:y2, x1:x2] = roi
            return "white"

        # LaMa Box Mode
        box_mask = np.zeros(roi.shape[:2], dtype=np.uint8)
        if shape == "ellipse":
            cv2.ellipse(box_mask, (roi.shape[1] // 2, roi.shape[0] // 2), (roi.shape[1] // 2, roi.shape[0] // 2), 0, 0, 360, 255, -1)
        else:
            box_mask.fill(255)

        target_size = max(512, int(max(bw, bh) * 2.2))
        pad_x = max(80, (target_size - bw) // 2)
        pad_y = max(80, (target_size - bh) // 2)

        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(img_w, x2 + pad_x)
        cy2 = min(img_h, y2 + pad_y)

        crop_bgr = image_np[cy1:cy2, cx1:cx2].copy()
        crop_mask = np.zeros(crop_bgr.shape[:2], dtype=np.uint8)
        crop_mask[y1 - cy1:y1 - cy1 + roi.shape[0], x1 - cx1:x1 - cx1 + roi.shape[1]] = box_mask

        inpainted = inpaint_patch_with_lama(crop_bgr, crop_mask)
        blend_inpainted_patch(image_np, inpainted, crop_mask, cx1, cy1, cx2, cy2)
        return "inpaint"

    # --- Повёрнутый бабл ---
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
    use_white = (force_mode == "white") or (force_mode == "auto" and is_mostly_white_bubble(upright_patch, gray_patch))

    if use_white or ml.inpaint_model is None:
        clean_white_bubble_patch(upright_patch, gray_patch, shape=shape)
        cleaned_upright = upright_patch
        used_method = "white"
    else:
        target_size = max(512, int(max(bw, bh) * 2.2))
        pad_x = max(80, (target_size - bw) // 2)
        pad_y = max(80, (target_size - bh) // 2)
        pw = bw + 2 * pad_x
        ph = bh + 2 * pad_y

        dst_pts_padded = np.float32([
            [pad_x, pad_y],
            [pad_x + bw, pad_y],
            [pad_x, pad_y + bh]
        ])
        m_extract_padded = cv2.getAffineTransform(src_pts, dst_pts_padded)
        padded_patch = cv2.warpAffine(
            image_np, m_extract_padded, (pw, ph),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )

        clean_mask = np.zeros((ph, pw), dtype=np.uint8)
        if shape == "ellipse":
            cv2.ellipse(clean_mask, (pad_x + bw // 2, pad_y + bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
        else:
            clean_mask[pad_y:pad_y + bh, pad_x:pad_x + bw] = 255

        inpainted_padded = inpaint_patch_with_lama(padded_patch, clean_mask)
        cleaned_upright = inpainted_padded[pad_y:pad_y + bh, pad_x:pad_x + bw]
        used_method = "inpaint"

    mask_patch = np.zeros((bh, bw), dtype=np.uint8)
    if shape == "ellipse":
        cv2.ellipse(mask_patch, (bw // 2, bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
    else:
        mask_patch.fill(255)

    mask_patch_feathered = cv2.GaussianBlur(mask_patch.astype(np.float32) / 255.0, (5, 5), 1.2)

    m_paste = cv2.getAffineTransform(dst_pts, src_pts)
    cleaned_back = cv2.warpAffine(
        cleaned_upright, m_paste, (img_w, img_h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    alpha_back = cv2.warpAffine(
        mask_patch_feathered, m_paste, (img_w, img_h),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )

    alpha_3d = np.expand_dims(alpha_back, axis=2)
    blended = image_np.astype(np.float32) * (1.0 - alpha_3d) + cleaned_back.astype(np.float32) * alpha_3d
    image_np[:] = np.clip(blended, 0, 255).astype(np.uint8)

    return used_method


def spot_clean_region(image_np: np.ndarray, box: dict, method: str = "auto") -> str:
    """
    Точечная очистка области:
    - method == 'auto': автовыбор белого или LaMa box.
    - method == 'white': аккуратно заливает/выбеливает бабл белым.
    - method in ('lama', 'lama_box'): ПОЛНОСТЬЮ стирает бабл/плашку и восстанавливает рисунок нейросетью LaMa с широким контекстом (>= 512px).
    """
    try:
        if method == "auto":
            return clean_speech_bubble(image_np, box, force_mode="auto")

        cx, cy, bw, bh, rot, shape = get_box_geometry(image_np, box)
        img_h, img_w = image_np.shape[:2]

        # --- НЕПОВЁРНУТЫЙ БОКС ---
        if abs(rot) < 0.5:
            x1 = max(0, int(cx - bw / 2.0))
            y1 = max(0, int(cy - bh / 2.0))
            x2 = min(img_w, x1 + bw)
            y2 = min(img_h, y1 + bh)

            roi = image_np[y1:y2, x1:x2]
            if roi.size == 0:
                return "skipped"

            # 1. Белый клин
            if method == "white" or ml.inpaint_model is None:
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                clean_white_bubble_patch(roi, gray, shape=shape)
                image_np[y1:y2, x1:x2] = roi
                return "white"

            # 2. РЕЖИМ LAMA (Box Mode)
            box_mask = np.zeros(roi.shape[:2], dtype=np.uint8)
            if shape == "ellipse":
                cv2.ellipse(box_mask, (roi.shape[1] // 2, roi.shape[0] // 2), (roi.shape[1] // 2, roi.shape[0] // 2), 0, 0, 360, 255, -1)
            else:
                box_mask.fill(255)

            target_size = max(512, int(max(bw, bh) * 2.2))
            pad_x = max(90, (target_size - bw) // 2)
            pad_y = max(90, (target_size - bh) // 2)

            cx1 = max(0, x1 - pad_x)
            cy1 = max(0, y1 - pad_y)
            cx2 = min(img_w, x2 + pad_x)
            cy2 = min(img_h, y2 + pad_y)

            crop_bgr = image_np[cy1:cy2, cx1:cx2].copy()
            crop_mask = np.zeros(crop_bgr.shape[:2], dtype=np.uint8)
            crop_mask[y1 - cy1:y1 - cy1 + roi.shape[0], x1 - cx1:x1 - cx1 + roi.shape[1]] = box_mask

            inpainted = inpaint_patch_with_lama(crop_bgr, crop_mask)
            blend_inpainted_patch(image_np, inpainted, crop_mask, cx1, cy1, cx2, cy2)
            return "inpaint"

        # --- ПОВЁРНУТЫЙ БОКС ---
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

        if method == "white" or ml.inpaint_model is None:
            gray_patch = cv2.cvtColor(upright_patch, cv2.COLOR_BGR2GRAY)
            clean_white_bubble_patch(upright_patch, gray_patch, shape=shape)
            cleaned_upright = upright_patch
            used_method = "white"
        else:
            target_size = max(512, int(max(bw, bh) * 2.2))
            pad_x = max(90, (target_size - bw) // 2)
            pad_y = max(90, (target_size - bh) // 2)
            pw = bw + 2 * pad_x
            ph = bh + 2 * pad_y

            dst_pts_padded = np.float32([[pad_x, pad_y], [pad_x + bw, pad_y], [pad_x, pad_y + bh]])
            m_extract_padded = cv2.getAffineTransform(src_pts, dst_pts_padded)
            padded_patch = cv2.warpAffine(
                image_np, m_extract_padded, (pw, ph),
                flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
            )

            clean_mask = np.zeros((ph, pw), dtype=np.uint8)
            if shape == "ellipse":
                cv2.ellipse(clean_mask, (pad_x + bw // 2, pad_y + bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
            else:
                clean_mask[pad_y:pad_y + bh, pad_x:pad_x + bw] = 255

            inpainted_padded = inpaint_patch_with_lama(padded_patch, clean_mask)
            cleaned_upright = inpainted_padded[pad_y:pad_y + bh, pad_x:pad_x + bw]
            used_method = "inpaint"

        mask_patch = np.zeros((bh, bw), dtype=np.uint8)
        if shape == "ellipse":
            cv2.ellipse(mask_patch, (bw // 2, bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
        else:
            mask_patch.fill(255)

        mask_patch_feathered = cv2.GaussianBlur(mask_patch.astype(np.float32) / 255.0, (5, 5), 1.2)

        m_paste = cv2.getAffineTransform(dst_pts, src_pts)
        cleaned_back = cv2.warpAffine(
            cleaned_upright, m_paste, (img_w, img_h),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
        alpha_back = cv2.warpAffine(
            mask_patch_feathered, m_paste, (img_w, img_h),
            flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0
        )

        alpha_3d = np.expand_dims(alpha_back, axis=2)
        blended = image_np.astype(np.float32) * (1.0 - alpha_3d) + cleaned_back.astype(np.float32) * alpha_3d
        image_np[:] = np.clip(blended, 0, 255).astype(np.uint8)

        return used_method
    finally:
        if method in ["lama", "lama_box"]:
            release_vram()


def inpaint_by_brush_mask(image_np: np.ndarray, mask_gray: np.ndarray, mode: str = "lama") -> np.ndarray:
    """
    Обработка мазка кисти (ручной режим) с защитой от накопления кэша VRAM.
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

    try:
        points = cv2.findNonZero(mask_gray)
        if points is None:
            return image_np

        x, y, w, h = cv2.boundingRect(points)
        img_h, img_w = image_np.shape[:2]

        target_size = max(512, int(max(w, h) * 2.0))
        pad_x = max(70, (target_size - w) // 2)
        pad_y = max(70, (target_size - h) // 2)

        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(img_w, x + w + pad_x)
        y2 = min(img_h, y + h + pad_y)

        crop_bgr = image_np[y1:y2, x1:x2].copy()
        crop_mask = mask_gray[y1:y2, x1:x2]

        inpainted_crop = inpaint_patch_with_lama(crop_bgr, crop_mask)
        blend_inpainted_patch(image_np, inpainted_crop, crop_mask, x1, y1, x2, y2)

        return image_np
    finally:
        release_vram()
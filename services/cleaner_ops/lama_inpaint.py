# services/cleaner_ops/lama_inpaint.py
# Нейросетевой клин LaMa и сглаженное вклеивание патчей

import math
from typing import Tuple
import cv2
import numpy as np
from PIL import Image
import torch

from ml.models import ml
from config import LAMA_FORCE_GRAYSCALE, MAX_LAMA_DIM
from database import get_db
from logger import logger

from services.cleaner_ops.image_io import is_patch_monochrome
from services.cleaner_ops.white_bubble import _create_shape_mask


def inpaint_patch_with_lama(patch_bgr: np.ndarray, mask: np.ndarray, clean_model_name: str = "") -> np.ndarray:
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT lama_downscale FROM global_settings WHERE id = 1")
            row = cur.fetchone()
            if row:
                ml.lama_downscale = bool(row["lama_downscale"])
    except Exception as e:
        logger.debug(f"Не удалось прочитать lama_downscale из global_settings: {e}")

    model = ml.load_cleaner(clean_model_name)
    if model is None:
        return patch_bgr

    h, w = patch_bgr.shape[:2]
    max_dim = max(h, w)

    need_downscale = ml.lama_downscale and (max_dim > MAX_LAMA_DIM)
    if need_downscale:
        scale_factor = MAX_LAMA_DIM / float(max_dim)
        proc_w = max(16, int(round(w * scale_factor)))
        proc_h = max(16, int(round(h * scale_factor)))
        proc_patch = cv2.resize(patch_bgr, (proc_w, proc_h), interpolation=cv2.INTER_AREA)
        proc_mask = cv2.resize(mask, (proc_w, proc_h), interpolation=cv2.INTER_NEAREST)
    else:
        proc_patch = patch_bgr
        proc_mask = mask

    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dilated_mask = cv2.dilate(proc_mask, dilate_kernel, iterations=1)

    crop_pil = Image.fromarray(cv2.cvtColor(proc_patch, cv2.COLOR_BGR2RGB))
    mask_pil = Image.fromarray(dilated_mask)

    with torch.inference_mode():
        inpainted_pil = model(crop_pil, mask_pil)

    inpainted_bgr = cv2.cvtColor(np.array(inpainted_pil), cv2.COLOR_RGB2BGR)

    if inpainted_bgr.shape[:2] != (h, w):
        inpainted_bgr = cv2.resize(inpainted_bgr, (w, h), interpolation=cv2.INTER_LANCZOS4)

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
    roi_orig = target_img[y1:y2, x1:x2].astype(np.float32)
    roi_inp = inpainted_patch.astype(np.float32)

    dilated = cv2.dilate(clean_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
    feathered = cv2.GaussianBlur(dilated.astype(np.float32) / 255.0, (5, 5), 1.5)
    alpha = np.expand_dims(feathered, axis=2)

    blended = roi_orig * (1.0 - alpha) + roi_inp * alpha
    target_img[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)


def _get_affine_points(cx: float, cy: float, bw: int, bh: int, rot: float) -> Tuple[np.ndarray, np.ndarray]:
    rad = math.radians(rot)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    src_pts = np.float32([
        [cx - (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (-bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],
        [cx + (bw / 2.0) * cos_a - (-bh / 2.0) * sin_a, cy + (-bw / 2.0) * sin_a + (-bh / 2.0) * cos_a],
        [cx - (bw / 2.0) * cos_a - (bh / 2.0) * sin_a,  cy + (-bw / 2.0) * sin_a + (bh / 2.0) * cos_a]
    ])
    dst_pts = np.float32([[0, 0], [bw, 0], [0, bh]])
    return src_pts, dst_pts


def _blend_rotated_patch(
    image_np: np.ndarray,
    cleaned_upright: np.ndarray,
    src_pts: np.ndarray,
    dst_pts: np.ndarray,
    bw: int,
    bh: int,
    shape: str = "rect"
):
    img_h, img_w = image_np.shape[:2]
    mask_patch = _create_shape_mask(bh, bw, shape)
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

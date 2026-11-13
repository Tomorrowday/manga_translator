# services/cleaner_ops/bubble_cleaner.py
# Очистка отдельного речевого бабла (White / LaMa с учётом поворота)

import cv2
import numpy as np

from services.cleaner_ops.image_io import get_box_geometry
from services.cleaner_ops.white_bubble import (
    is_mostly_white_bubble,
    clean_white_bubble_patch,
    _create_shape_mask,
)
from services.cleaner_ops.lama_inpaint import (
    inpaint_patch_with_lama,
    blend_inpainted_patch,
    _get_affine_points,
    _blend_rotated_patch,
)


def clean_speech_bubble(
    image_np: np.ndarray,
    box: dict,
    force_mode: str = "auto",
    clean_model_name: str = "",
    min_pad: int = 80
) -> str:
    cx, cy, bw, bh, rot, _ = get_box_geometry(image_np, box)
    img_h, img_w = image_np.shape[:2]
    class_id = int(box.get("class_id", 0))

    if force_mode == "white":
        target_use_white = True
    elif force_mode in ("lama", "lama_box"):
        target_use_white = False
    elif class_id in (0, 1):
        target_use_white = True
    elif class_id == 2:
        target_use_white = False
    else:
        target_use_white = None

    if abs(rot) < 0.5:
        x1 = max(0, int(cx - bw / 2.0))
        y1 = max(0, int(cy - bh / 2.0))
        x2 = min(img_w, x1 + bw)
        y2 = min(img_h, y1 + bh)

        roi = image_np[y1:y2, x1:x2]
        if roi.size == 0:
            return "skipped"

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        use_white = target_use_white if target_use_white is not None else is_mostly_white_bubble(roi, gray)

        if use_white:
            clean_white_bubble_patch(roi, gray)
            image_np[y1:y2, x1:x2] = roi
            return "white"

        box_mask = _create_shape_mask(roi.shape[0], roi.shape[1], "rect")
        target_size = max(512, int(max(bw, bh) * 2.2))
        pad_x = max(min_pad, (target_size - bw) // 2)
        pad_y = max(min_pad, (target_size - bh) // 2)

        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(img_w, x2 + pad_x)
        cy2 = min(img_h, y2 + pad_y)

        crop_bgr = image_np[cy1:cy2, cx1:cx2].copy()
        crop_mask = np.zeros(crop_bgr.shape[:2], dtype=np.uint8)
        crop_mask[y1 - cy1:y1 - cy1 + roi.shape[0], x1 - cx1:x1 - cx1 + roi.shape[1]] = box_mask

        inpainted = inpaint_patch_with_lama(crop_bgr, crop_mask, clean_model_name=clean_model_name)
        blend_inpainted_patch(image_np, inpainted, crop_mask, cx1, cy1, cx2, cy2)
        return "inpaint"

    src_pts, dst_pts = _get_affine_points(cx, cy, bw, bh, rot)
    m_extract = cv2.getAffineTransform(src_pts, dst_pts)
    upright_patch = cv2.warpAffine(
        image_np, m_extract, (bw, bh),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )

    gray_patch = cv2.cvtColor(upright_patch, cv2.COLOR_BGR2GRAY)
    use_white = target_use_white if target_use_white is not None else is_mostly_white_bubble(upright_patch, gray_patch)

    if use_white:
        clean_white_bubble_patch(upright_patch, gray_patch)
        cleaned_upright = upright_patch
        used_method = "white"
    else:
        target_size = max(512, int(max(bw, bh) * 2.2))
        pad_x = max(min_pad, (target_size - bw) // 2)
        pad_y = max(min_pad, (target_size - bh) // 2)
        pw = bw + 2 * pad_x
        ph = bh + 2 * pad_y

        dst_pts_padded = np.float32([[pad_x, pad_y], [pad_x + bw, pad_y], [pad_x, pad_y + bh]])
        m_extract_padded = cv2.getAffineTransform(src_pts, dst_pts_padded)
        padded_patch = cv2.warpAffine(
            image_np, m_extract_padded, (pw, ph),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )

        clean_mask = np.zeros((ph, pw), dtype=np.uint8)
        clean_mask[pad_y:pad_y + bh, pad_x:pad_x + bw] = _create_shape_mask(bh, bw, "rect")

        inpainted_padded = inpaint_patch_with_lama(padded_patch, clean_mask, clean_model_name=clean_model_name)
        cleaned_upright = inpainted_padded[pad_y:pad_y + bh, pad_x:pad_x + bw]
        used_method = "inpaint"

    _blend_rotated_patch(image_np, cleaned_upright, src_pts, dst_pts, bw, bh, "rect")
    return used_method


def spot_clean_region(
    image_np: np.ndarray,
    box: dict,
    method: str = "auto",
    clean_model_name: str = ""
) -> str:
    min_pad = 90 if method in ("lama", "lama_box") else 80
    return clean_speech_bubble(image_np, box, force_mode=method, clean_model_name=clean_model_name, min_pad=min_pad)

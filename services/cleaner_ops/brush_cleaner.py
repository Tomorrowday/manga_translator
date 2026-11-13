# services/cleaner_ops/brush_cleaner.py
# Очистка произвольного мазка кисти пользователя

import cv2
import numpy as np

from services.cleaner_ops.lama_inpaint import inpaint_patch_with_lama, blend_inpainted_patch


def inpaint_by_brush_mask(
    image_np: np.ndarray,
    mask_gray: np.ndarray,
    mode: str = "lama",
    clean_model_name: str = ""
) -> np.ndarray:
    if mode == "white":
        image_np[mask_gray > 127] = [255, 255, 255]
        return image_np

    if mode == "black":
        image_np[mask_gray > 127] = [0, 0, 0]
        return image_np

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

    inpainted_crop = inpaint_patch_with_lama(crop_bgr, crop_mask, clean_model_name=clean_model_name)
    blend_inpainted_patch(image_np, inpainted_crop, crop_mask, x1, y1, x2, y2)
    return image_np

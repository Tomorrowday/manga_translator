# services/cleaner_ops/image_io.py
# Безопасное чтение/сохранение изображений с Unicode-путями и геометрия бабла

import os
from typing import Tuple
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

from logger import logger


def load_image_cv2(image_path: str) -> np.ndarray:
    """Безопасное чтение изображений с любыми символами в пути (русские, японские, иероглифы)."""
    try:
        data = np.fromfile(str(image_path), dtype=np.uint8)
        if data.size > 0:
            img = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if img is not None:
                return img
    except Exception as e:
        logger.debug(f"np.fromfile не смог открыть {image_path}: {e}")

    pil_img = Image.open(image_path).convert("RGB")
    rgb_arr = np.array(pil_img)
    return cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)


def save_image_cv2(image_path: str, img: np.ndarray) -> bool:
    """Безопасное сохранение изображения на Windows с не-ASCII символами в пути."""
    try:
        Path(image_path).parent.mkdir(parents=True, exist_ok=True)
        ext = os.path.splitext(image_path)[1].lower()
        if not ext:
            ext = ".png"
        success, encoded = cv2.imencode(ext, img)
        if success:
            with open(image_path, "wb") as f:
                f.write(encoded)
            return True
        logger.error(f"imencode завершился с ошибкой для {image_path}")
    except Exception as e:
        logger.error(f"Ошибка сохранения изображения {image_path}: {e}")
    return False


def is_patch_monochrome(patch_bgr: np.ndarray, threshold: float = 6.0) -> bool:
    if patch_bgr.size == 0:
        return True
    b = patch_bgr[:, :, 0].astype(np.int16)
    g = patch_bgr[:, :, 1].astype(np.int16)
    r = patch_bgr[:, :, 2].astype(np.int16)
    diff = np.maximum(np.abs(b - g), np.maximum(np.abs(b - r), np.abs(g - r)))
    return float(np.mean(diff)) < threshold


def get_box_geometry(image_np: np.ndarray, box: dict) -> Tuple[float, float, int, int, float, str]:
    img_h, img_w = image_np.shape[:2]
    cx = (box["x"] + box["width"] / 2.0) * img_w
    cy = (box["y"] + box["height"] / 2.0) * img_h
    bw = max(4, int(box["width"] * img_w))
    bh = max(4, int(box["height"] * img_h))
    rot = float(box.get("rotation", 0.0) or 0.0)
    return cx, cy, bw, bh, rot, "rect"

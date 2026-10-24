# services/cleaner.py
"""
Каркас сервиса очистки баблов (White Clean + LaMa Inpainting).
Реализация: services/cleaner_impl.py
Зависимости реализации: os, math, pathlib, cv2, numpy, PIL, torch, ml.models, config, database, logger
"""

from typing import Tuple
import numpy as np
import services.cleaner_impl as _impl

# Реэкспорт утилиты очистки памяти для обратной совместимости
from ml.models import release_vram  # noqa: F401


def load_image_cv2(image_path: str) -> np.ndarray:
    """Безопасное чтение изображений с любыми символами в пути (русские, японские)."""
    return _impl.load_image_cv2(image_path)


def save_image_cv2(image_path: str, img: np.ndarray) -> bool:
    """Безопасное сохранение изображения на Windows с не-ASCII символами в пути."""
    return _impl.save_image_cv2(image_path, img)


def is_patch_monochrome(patch_bgr: np.ndarray, threshold: float = 6.0) -> bool:
    """Проверяет, является ли область черно-белой/монохромной."""
    return _impl.is_patch_monochrome(patch_bgr, threshold)


def is_mostly_white_bubble(roi: np.ndarray, gray: np.ndarray) -> bool:
    """Эвристика: является ли бабл белым фоновым баблом речи."""
    return _impl.is_mostly_white_bubble(roi, gray)


def clean_white_bubble_patch(roi: np.ndarray, gray: np.ndarray) -> None:
    """Морфологическая очистка текста внутри белого бабла с сохранением контура."""
    _impl.clean_white_bubble_patch(roi, gray)


def inpaint_patch_with_lama(patch_bgr: np.ndarray, mask: np.ndarray, clean_model_name: str = "") -> np.ndarray:
    """Запуск нейросетевого клина патча через LaMa Inpainting."""
    return _impl.inpaint_patch_with_lama(patch_bgr, mask, clean_model_name)


def blend_inpainted_patch(
    target_img: np.ndarray,
    inpainted_patch: np.ndarray,
    clean_mask: np.ndarray,
    x1: int, y1: int, x2: int, y2: int
) -> None:
    """Сглаженное вклеивание очищенного патча с растушевкой краев."""
    _impl.blend_inpainted_patch(target_img, inpainted_patch, clean_mask, x1, y1, x2, y2)


def get_box_geometry(image_np: np.ndarray, box: dict) -> Tuple[float, float, int, int, float, str]:
    """Преобразует нормализованные координаты бабла в пиксельные значения."""
    return _impl.get_box_geometry(image_np, box)


def clean_speech_bubble(
    image_np: np.ndarray,
    box: dict,
    force_mode: str = "auto",
    clean_model_name: str = "",
    min_pad: int = 80
) -> str:
    """Очищает отдельный речевой бабл (White или LaMa с учетом угла поворота)."""
    return _impl.clean_speech_bubble(image_np, box, force_mode, clean_model_name, min_pad)


def spot_clean_region(
    image_np: np.ndarray,
    box: dict,
    method: str = "auto",
    clean_model_name: str = ""
) -> str:
    """Точечная очистка области пользователем (Spot Clean)."""
    return _impl.spot_clean_region(image_np, box, method, clean_model_name)


def inpaint_by_brush_mask(
    image_np: np.ndarray,
    mask_gray: np.ndarray,
    mode: str = "lama",
    clean_model_name: str = ""
) -> np.ndarray:
    """Очистка произвольного мазка кисти пользователя (LaMa, White или Black)."""
    return _impl.inpaint_by_brush_mask(image_np, mask_gray, mode, clean_model_name)
# services/detector.py
"""
Каркас сервиса детекции речевых баблов и текста (YOLO) и определения порядка чтения манги.
Реализация: services/detector_impl.py
Зависимости реализации: cv2, numpy, PIL, torch, ml.models (ml), logger
"""

from typing import List, Dict, Any, Tuple, Optional
import numpy as np
from PIL import Image
import services.detector_impl as _impl


def sort_manga_reading_order(
    boxes: List[Dict[str, Any]],
    gray_img: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    """Сортирует найденные баблы страницы в порядке чтения манги (справа налево, сверху вниз)."""
    return _impl.sort_manga_reading_order(boxes, gray_img)


def expand_box_to_bubble(
    gray_img: np.ndarray,
    orig_x1: int,
    orig_y1: int,
    orig_x2: int,
    orig_y2: int,
    other_boxes: Optional[List[Tuple[int, int, int, int]]] = None
) -> Tuple[int, int, int, int]:
    """Адаптивно расширяет рамку текста до белых границ овала речевого бабла."""
    return _impl.expand_box_to_bubble(gray_img, orig_x1, orig_y1, orig_x2, orig_y2, other_boxes)


def detect_and_filter_bubbles(
    image: Image.Image,
    model_name: str = "yolo_manga.pt",
    conf_threshold: float = 0.25,
    detect_sfx: bool = False
) -> List[Dict[str, Any]]:
    """
    Выполняет детекцию речевых баблов и текста нейросетью YOLO,
    фильтрует вложенные рамки, подтягивает контуры к овалу и сортирует в порядке чтения.
    Если detect_sfx=False, то звуки SFX (класс 3) отбрасываются.
    """
    return _impl.detect_and_filter_bubbles(image, model_name, conf_threshold, detect_sfx)
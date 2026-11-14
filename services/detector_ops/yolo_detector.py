# services/detector_ops/yolo_detector.py
# Вызов YOLO, фильтрация вложенных рамок и сборка результата детекции

from typing import List, Dict, Any, Tuple
from collections import Counter
import cv2
import numpy as np
from PIL import Image
import torch
from ml.models import ml
from logger import logger

from services.detector_ops.box_expander import expand_box_to_bubble
from services.detector_ops.reading_order import sort_manga_reading_order


def detect_and_filter_bubbles(
    image: Image.Image,
    model_name: str = "yolo_manga.pt",
    conf_threshold: float = 0.25,
    detect_sfx: bool = False
) -> List[Dict[str, Any]]:
    """Детекция объектов (YOLO). Если detect_sfx=False, то SFX (класс 3) полностью игнорируется."""
    yolo = ml.get_yolo(model_name)
    if yolo is None:
        raise RuntimeError(f"Модель YOLO ({model_name}) не загружена")

    model_classes = getattr(yolo, "names", {})
    logger.info(
        f"[YOLO Детектор] Запуск '{model_name}' с порогом conf={conf_threshold}, detect_sfx={detect_sfx}. "
        f"Классы: {model_classes}"
    )

    img_width, img_height = image.size

    with ml.lock, torch.inference_mode():
        results = yolo.predict(image, conf=conf_threshold, verbose=False)
        raw_items = []
        for box in results[0].boxes:
            cls_id = int(box.cls[0].item()) if (box.cls is not None and len(box.cls) > 0) else 0

            # Если детект SFX отключен — полностью игнорируем класс 3
            if not detect_sfx and cls_id == 3:
                continue

            xyxy = box.xyxy[0].tolist()
            raw_items.append((xyxy, cls_id))

    del results

    filtered_items: List[Tuple[List[float], int]] = []
    for i, (box_a, cls_a) in enumerate(raw_items):
        x1_a, y1_a, x2_a, y2_a = box_a
        is_outer = False

        for j, (box_b, _) in enumerate(raw_items):
            if i == j:
                continue
            x1_b, y1_b, x2_b, y2_b = box_b

            if (x1_a - 15 <= x1_b and y1_a - 15 <= y1_b and
                    x2_a + 15 >= x2_b and y2_a + 15 >= y2_b):
                is_outer = True
                break

        if not is_outer:
            filtered_items.append((box_a, cls_a))

    np_img = np.array(image.convert("RGB"))
    gray_img = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)

    int_boxes: List[Tuple[int, int, int, int, int]] = []
    for box_coords, cls_id in filtered_items:
        x1, y1, x2, y2 = box_coords
        ix1 = int(max(0, x1))
        iy1 = int(max(0, y1))
        ix2 = int(min(img_width, x2))
        iy2 = int(min(img_height, y2))
        if ix2 > ix1 + 4 and iy2 > iy1 + 4:
            int_boxes.append((ix1, iy1, ix2, iy2, cls_id))

    boxes: List[Dict[str, Any]] = []
    plain_coords = [(b[0], b[1], b[2], b[3]) for b in int_boxes]

    for idx, (ix1, iy1, ix2, iy2, cls_id) in enumerate(int_boxes):
        other_boxes = [b for j, b in enumerate(plain_coords) if j != idx]

        if cls_id in (0, 1):
            ex1, ey1, ex2, ey2 = expand_box_to_bubble(gray_img, ix1, iy1, ix2, iy2, other_boxes)
        else:
            ex1, ey1, ex2, ey2 = ix1, iy1, ix2, iy2

        px1 = max(0.0, ex1 / img_width)
        py1 = max(0.0, ey1 / img_height)
        px2 = min(1.0, ex2 / img_width)
        py2 = min(1.0, ey2 / img_height)

        boxes.append({
            "x": px1,
            "y": py1,
            "width": max(0.01, px2 - px1),
            "height": max(0.01, py2 - py1),
            "class_id": cls_id,
        })

    boxes = sort_manga_reading_order(boxes, gray_img=gray_img)

    counts = Counter(b["class_id"] for b in boxes)
    readable_counts = {model_classes.get(cid, f"Класс {cid}"): count for cid, count in counts.items()}
    logger.info(f"[YOLO Детектор] Найдено объектов: {len(boxes)}. Распределение: {readable_counts}")

    return boxes

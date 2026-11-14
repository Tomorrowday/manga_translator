# services/detector_ops/reading_order.py
# Сортировка найденных баблов страницы в порядке чтения манги

from typing import List, Dict, Any, Optional
import numpy as np

from services.detector_ops.gutter_cutter import _partition_and_sort_xy
from services.detector_ops.region_sorter import _sort_region_reading_order


def sort_manga_reading_order(
    boxes: List[Dict[str, Any]],
    gray_img: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    if len(boxes) <= 1:
        for i, b in enumerate(boxes):
            b["order_index"] = i + 1
        return boxes

    items: List[Dict[str, Any]] = []
    for b in boxes:
        x1 = float(b["x"])
        y1 = float(b["y"])
        w = max(0.01, float(b["width"]))
        h = max(0.01, float(b["height"]))
        items.append({
            "orig": b,
            "x1": x1,
            "y1": y1,
            "x2": x1 + w,
            "y2": y1 + h,
            "w": w,
            "h": h,
            "cx": x1 + w * 0.5,
            "cy": y1 + h * 0.5,
        })

    if gray_img is not None and gray_img.ndim == 2 and gray_img.shape[0] > 40 and gray_img.shape[1] > 40:
        img_h, img_w = gray_img.shape[:2]
        ordered_items = _partition_and_sort_xy(gray_img, items, 0, img_h, 0, img_w, depth=0)
    else:
        ordered_items = _sort_region_reading_order(items)

    final_ordered = [it["orig"] for it in ordered_items]
    for i, item in enumerate(final_ordered):
        item["order_index"] = i + 1

    return final_ordered

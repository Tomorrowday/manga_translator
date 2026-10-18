# services/detector.py
# Детекция речевых баблов (YOLO), их фильтрация и деликатная подгонка к контурам

from typing import List, Dict, Any, Tuple
import cv2
import numpy as np
from PIL import Image
import torch
from ml.models import ml


def manga_sort_key(box: Dict[str, float]) -> tuple:
    """
    Ключ сортировки в японском порядке чтения (Manga Reading Order):
    1. Сверху вниз по вертикальным ярусам (кадрам).
    2. Внутри одного яруса — строго СПРАВА НАЛЕВО (по убыванию координаты X).
    """
    row_height = 0.18
    row_idx = int(box["y"] / row_height)
    return row_idx, -box["x"]


def expand_box_to_bubble(
    gray_img: np.ndarray,
    orig_x1: int,
    orig_y1: int,
    orig_x2: int,
    orig_y2: int,
    other_boxes: List[Tuple[int, int, int, int]] = None
) -> Tuple[int, int, int, int]:
    """
    Деликатное лучевое расширение:
    Мягко раздвигает бокс в стороны до черных стенок бабла.
    ГАРАНТИЯ: Итоговый бокс НИКОГДА не может стать уже или меньше исходного бокса от нейросети.
    """
    try:
        img_h, img_w = gray_img.shape[:2]

        x1 = max(0, min(img_w - 2, orig_x1))
        y1 = max(0, min(img_h - 2, orig_y1))
        x2 = max(x1 + 2, min(img_w, orig_x2))
        y2 = max(y1 + 2, min(img_h, orig_y2))

        bw = x2 - x1
        bh = y2 - y1

        if bw <= 4 or bh <= 4:
            return orig_x1, orig_y1, orig_x2, orig_y2

        roi = gray_img[y1:y2, x1:x2]
        if roi.size == 0 or np.mean(roi > 190) < 0.35:
            # Слишком тёмный фон или сложный арт — оставляем честный бокс YOLO
            return orig_x1, orig_y1, orig_x2, orig_y2

        is_giant_page_strip = (bh > img_h * 0.40)
        max_expand_x = min(20, max(6, int(bw * 0.25))) if is_giant_page_strip else min(70, max(25, int(bh * 0.35)))
        max_expand_y = min(18, max(6, int(bh * 0.10)))

        # Защитные пределы от соседей
        hard_limit_left = 2
        hard_limit_right = img_w - 2
        hard_limit_top = 2
        hard_limit_bottom = img_h - 2

        if other_boxes:
            cx = (x1 + x2) // 2
            for ox1, oy1, ox2, oy2 in other_boxes:
                # Если соседние боксы перекрываются по вертикали
                if min(y2, oy2) - max(y1, oy1) > 10:
                    ocx = (ox1 + ox2) // 2
                    if ocx < cx and ox2 < x1:
                        hard_limit_left = max(hard_limit_left, ox2 + 2)
                    elif ocx > cx and ox1 > x2:
                        hard_limit_right = min(hard_limit_right, ox1 - 2)

        y_slice_start = int(y1 + bh * 0.25)
        y_slice_end = int(y2 - bh * 0.25)
        if y_slice_end <= y_slice_start:
            y_slice_start, y_slice_end = y1, y2

        x_slice_start = int(x1 + bw * 0.25)
        x_slice_end = int(x2 - bw * 0.25)
        if x_slice_end <= x_slice_start:
            x_slice_start, x_slice_end = x1, x2

        # 1. ЛУЧ ВЛЕВО
        left_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x1 - dx
            if cur_x <= hard_limit_left:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            # Чернильная граница бабла: устойчивое падение средней яркости
            if np.mean(col < 130) > 0.25 or np.mean(col) < 185:
                break
            left_expand = dx

        # 2. ЛУЧ ВПРАВО
        right_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x2 + dx
            if cur_x >= hard_limit_right:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.mean(col < 130) > 0.25 or np.mean(col) < 185:
                break
            right_expand = dx

        # 3. ЛУЧ ВВЕРХ
        top_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y1 - dy
            if cur_y <= hard_limit_top:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.mean(row_pix < 130) > 0.25 or np.mean(row_pix) < 185:
                break
            top_expand = dy

        # 4. ЛУЧ ВНИЗ
        bottom_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y2 + dy
            if cur_y >= hard_limit_bottom:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.mean(row_pix < 130) > 0.25 or np.mean(row_pix) < 185:
                break
            bottom_expand = dy

        pad_in = 2
        exp_x1 = max(hard_limit_left, x1 - max(0, left_expand - pad_in))
        exp_x2 = min(hard_limit_right, x2 + max(0, right_expand - pad_in))
        exp_y1 = max(hard_limit_top, y1 - max(0, top_expand - pad_in))
        exp_y2 = min(hard_limit_bottom, y2 + max(0, bottom_expand - pad_in))

        # ЖЕЛЕЗНАЯ ЗАЩИТА: бокс может только расширяться, но не схлопываться внутрь
        final_x1 = min(orig_x1, exp_x1)
        final_x2 = max(orig_x2, exp_x2)
        final_y1 = min(orig_y1, exp_y1)
        final_y2 = max(orig_y2, exp_y2)

        # Если после всего ширина меньше 20px при высоте больше 100px — это аномалия, возвращаем оригинал
        if (final_x2 - final_x1) < 24 and (final_y2 - final_y1) > 80:
            return orig_x1, orig_y1, orig_x2, orig_y2

        return final_x1, final_y1, final_x2, final_y2
    except Exception:
        return orig_x1, orig_y1, orig_x2, orig_y2


def detect_and_filter_bubbles(image: Image.Image) -> List[Dict[str, Any]]:
    if ml.yolo_model is None:
        raise RuntimeError("Модель YOLO не загружена")

    img_width, img_height = image.size

    with torch.inference_mode():
        results = ml.yolo_model.predict(image, conf=0.25, verbose=False)
        raw_boxes = [box.xyxy[0].tolist() for box in results[0].boxes]

    del results

    # Фильтр: исключаем дублирующие внешние рамки
    filtered_boxes = []
    for i, box_a in enumerate(raw_boxes):
        x1_a, y1_a, x2_a, y2_a = box_a
        is_outer = False

        for j, box_b in enumerate(raw_boxes):
            if i == j:
                continue
            x1_b, y1_b, x2_b, y2_b = box_b

            if (x1_a - 15 <= x1_b and y1_a - 15 <= y1_b and
                    x2_a + 15 >= x2_b and y2_a + 15 >= y2_b):
                is_outer = True
                break

        if not is_outer:
            filtered_boxes.append(box_a)

    np_img = np.array(image.convert("RGB"))
    gray_img = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)

    int_boxes: List[Tuple[int, int, int, int]] = []
    for x1, y1, x2, y2 in filtered_boxes:
        ix1 = int(max(0, x1))
        iy1 = int(max(0, y1))
        ix2 = int(min(img_width, x2))
        iy2 = int(min(img_height, y2))
        if ix2 > ix1 + 4 and iy2 > iy1 + 4:
            int_boxes.append((ix1, iy1, ix2, iy2))

    boxes: List[Dict[str, Any]] = []
    for idx, (ix1, iy1, ix2, iy2) in enumerate(int_boxes):
        other_boxes = [b for j, b in enumerate(int_boxes) if j != idx]
        ex1, ey1, ex2, ey2 = expand_box_to_bubble(gray_img, ix1, iy1, ix2, iy2, other_boxes)

        px1 = max(0.0, ex1 / img_width)
        py1 = max(0.0, ey1 / img_height)
        px2 = min(1.0, ex2 / img_width)
        py2 = min(1.0, ey2 / img_height)

        boxes.append({
            "x": px1,
            "y": py1,
            "width": max(0.01, px2 - px1),
            "height": max(0.01, py2 - py1)
        })

    boxes.sort(key=manga_sort_key)

    for idx, b in enumerate(boxes):
        b["order_index"] = idx + 1

    return boxes
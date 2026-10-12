# services/detector.py
# Детекция речевых баблов (YOLO), их фильтрация и аккуратная подгонка внутрь контура

from typing import List, Dict, Any, Tuple
import cv2
import numpy as np
from PIL import Image
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
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    other_boxes: List[Tuple[int, int, int, int]] = None
) -> Tuple[int, int, int, int]:
    """
    Деликатное лучевое расширение к границам бабла:
    Доходит до черных стенок бабла с безопасным запасом (2-3px)
    и предотвращает наложение на соседние баблы.
    """
    try:
        img_h, img_w = gray_img.shape[:2]

        bw = x2 - x1
        bh = y2 - y1

        if bw <= 0 or bh <= 0:
            return x1, y1, x2, y2

        # Проверяем среднюю яркость внутри бокса
        roi = gray_img[max(0, y1):min(img_h, y2), max(0, x1):min(img_w, x2)]
        if roi.size == 0 or np.mean(roi > 200) < 0.40:
            # Тёмный фон или сложный арт — не трогаем границы
            return x1, y1, x2, y2

        # Защита очень длинных узких сносок на полях (например, реклама томов)
        is_tall_strip = (bh > bw * 4.5)

        # Комфортный размах лучей: расширяем шире до стенок, но с безопасным потолком
        if is_tall_strip:
            max_expand_x = min(18, max(6, int(bw * 0.25)))
        else:
            # Даем боксу дойти до стенок бабла (до 75px в каждую сторону)
            max_expand_x = min(75, max(16, int(bw * 0.85)))

        max_expand_y = min(20, max(6, int(bh * 0.14)))

        # Вычисляем физические пределы, чтобы не залезть на соседние баблы
        hard_limit_left = 2
        hard_limit_right = img_w - 2
        hard_limit_top = 2
        hard_limit_bottom = img_h - 2

        if other_boxes:
            for ox1, oy1, ox2, oy2 in other_boxes:
                # Если боксы на одной высоте (пересекаются по Y)
                if max(y1, oy1) < min(y2, oy2):
                    if ox2 <= x1:
                        hard_limit_left = max(hard_limit_left, ox2 + 3)
                    elif ox1 >= x2:
                        hard_limit_right = min(hard_limit_right, ox1 - 3)

        # Внутренний срез по высоте (сканируем по центральной трети текста)
        y_slice_start = int(y1 + bh * 0.25)
        y_slice_end = int(y2 - bh * 0.25)
        if y_slice_end <= y_slice_start:
            y_slice_start, y_slice_end = y1, y2

        # Внутренний срез по ширине (для сканирования вверх/вниз)
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
            # Останавливаемся у чернил контура бабла или скринтона
            if np.min(col) < 160 or np.mean(col) < 210:
                break
            left_expand = dx

        # 2. ЛУЧ ВПРАВО
        right_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x2 + dx
            if cur_x >= hard_limit_right:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.min(col) < 160 or np.mean(col) < 210:
                break
            right_expand = dx

        # 3. ЛУЧ ВВЕРХ
        top_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y1 - dy
            if cur_y <= hard_limit_top:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.min(row_pix) < 160 or np.mean(row_pix) < 210:
                break
            top_expand = dy

        # 4. ЛУЧ ВНИЗ
        bottom_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y2 + dy
            if cur_y >= hard_limit_bottom:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.min(row_pix) < 160 or np.mean(row_pix) < 210:
                break
            bottom_expand = dy

        # Отступ внутрь от контура бабла делаем 2-3px (вместо прежних 5px),
        # чтобы бокс подходил ближе к границе бабла для удобного тайпсета
        pad_in = 2
        final_x1 = max(hard_limit_left, x1 - max(0, left_expand - pad_in))
        final_x2 = min(hard_limit_right, x2 + max(0, right_expand - pad_in))
        final_y1 = max(hard_limit_top, y1 - max(0, top_expand - pad_in))
        final_y2 = min(hard_limit_bottom, y2 + max(0, bottom_expand - pad_in))

        return final_x1, final_y1, final_x2, final_y2
    # noinspection PyBroadException
    except Exception:
        return x1, y1, x2, y2


def detect_and_filter_bubbles(image: Image.Image) -> List[Dict[str, Any]]:
    if ml.yolo_model is None:
        raise RuntimeError("Модель YOLO не загружена")

    img_width, img_height = image.size
    results = ml.yolo_model.predict(image, conf=0.25)

    raw_boxes = [box.xyxy[0].tolist() for box in results[0].boxes]

    # Геометрический фильтр: исключаем дублирующие внешние рамки
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

    # Подготавливаем изображение для подгонки рамок
    np_img = np.array(image.convert("RGB"))
    gray_img = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)

    int_boxes: List[Tuple[int, int, int, int]] = []
    for x1, y1, x2, y2 in filtered_boxes:
        ix1 = int(max(0, x1))
        iy1 = int(max(0, y1))
        ix2 = int(min(img_width, x2))
        iy2 = int(min(img_height, y2))
        int_boxes.append((ix1, iy1, ix2, iy2))

    boxes: List[Dict[str, Any]] = []
    for idx, (ix1, iy1, ix2, iy2) in enumerate(int_boxes):
        # Список соседей для исключения взаимных коллизий
        other_boxes = [b for j, b in enumerate(int_boxes) if j != idx]

        # Лучевое расширение вплотную к стенкам бабла
        ex1, ey1, ex2, ey2 = expand_box_to_bubble(gray_img, ix1, iy1, ix2, iy2, other_boxes)

        px1 = max(0, ex1) / img_width
        py1 = max(0, ey1) / img_height
        px2 = min(img_width, ex2) / img_width
        py2 = min(img_height, ey2) / img_height

        boxes.append({
            "x": px1,
            "y": py1,
            "width": max(0.005, px2 - px1),
            "height": max(0.005, py2 - py1)
        })

    # Сортируем баблы в правильном японском порядке чтения
    boxes.sort(key=manga_sort_key)

    for idx, b in enumerate(boxes):
        b["order_index"] = idx + 1

    return boxes
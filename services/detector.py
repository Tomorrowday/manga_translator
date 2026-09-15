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


def expand_box_to_bubble(gray_img: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> Tuple[int, int, int, int]:
    """
    Деликатное лучевое расширение:
    Мягко раздвигает бокс в стороны до черных стенок бабла с запасом отступа,
    чтобы углы описанного прямоугольника не вылезали за контур эллиптических баблов.
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

        # Ограничиваем максимальный размах лучей
        max_expand_x = min(35, max(10, int(bw * 0.40)))
        max_expand_y = min(15, max(6, int(bh * 0.12)))

        # Внутренний срез по высоте (чтобы не задевать верх/низ при сканировании влево/вправо)
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
            if cur_x < 2:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.min(col) < 165 or np.mean(col) < 210:
                break
            left_expand = dx

        # 2. ЛУЧ ВПРАВО
        right_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x2 + dx
            if cur_x >= img_w - 2:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.min(col) < 165 or np.mean(col) < 210:
                break
            right_expand = dx

        # 3. ЛУЧ ВВЕРХ
        top_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y1 - dy
            if cur_y < 2:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.min(row_pix) < 165 or np.mean(row_pix) < 210:
                break
            top_expand = dy

        # 4. ЛУЧ ВНИЗ
        bottom_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y2 + dy
            if cur_y >= img_h - 2:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.min(row_pix) < 165 or np.mean(row_pix) < 210:
                break
            bottom_expand = dy

        # Увеличенный внутренний отступ назад от границы бабла (5px),
        # благодаря чему углы прямоугольника гарантированно помещаются в овал
        pad_in = 5
        final_x1 = max(0, x1 - max(0, left_expand - pad_in))
        final_x2 = min(img_w, x2 + max(0, right_expand - pad_in))
        final_y1 = max(0, y1 - max(0, top_expand - pad_in))
        final_y2 = min(img_h, y2 + max(0, bottom_expand - pad_in))

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

    # Подготавливаем изображение для деликатной подгонки рамок к стенкам бабла
    np_img = np.array(image.convert("RGB"))
    gray_img = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)

    boxes: List[Dict[str, Any]] = []
    for x1, y1, x2, y2 in filtered_boxes:
        ix1 = int(max(0, x1))
        iy1 = int(max(0, y1))
        ix2 = int(min(img_width, x2))
        iy2 = int(min(img_height, y2))

        # Лучевое расширение с безопасным отступом от контура
        ex1, ey1, ex2, ey2 = expand_box_to_bubble(gray_img, ix1, iy1, ix2, iy2)

        # Небольшой внутренний inset (1.5%), чтобы углы гарантированно вписывались в овал
        box_w = ex2 - ex1
        box_h = ey2 - ey1
        inset_x = int(box_w * 0.015)
        inset_y = int(box_h * 0.015)

        ex1_clamped = min(ex2 - 4, ex1 + inset_x)
        ex2_clamped = max(ex1 + 4, ex2 - inset_x)
        ey1_clamped = min(ey2 - 4, ey1 + inset_y)
        ey2_clamped = max(ey1 + 4, ey2 - inset_y)

        px1 = max(0, ex1_clamped) / img_width
        py1 = max(0, ey1_clamped) / img_height
        px2 = min(img_width, ex2_clamped) / img_width
        py2 = min(img_height, ey2_clamped) / img_height

        boxes.append({
            "x": px1,
            "y": py1,
            "width": px2 - px1,
            "height": py2 - py1
        })

    # Сортируем баблы в правильном японском порядке чтения
    boxes.sort(key=manga_sort_key)

    for idx, b in enumerate(boxes):
        b["order_index"] = idx + 1

    return boxes
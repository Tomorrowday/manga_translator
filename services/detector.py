# services/detector.py
# Детекция речевых баблов (YOLO), их фильтрация и деликатная подгонка к контурам

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
    Деликатное лучевое расширение:
    Мягко раздвигает бокс в стороны до черных стенок бабла с запасом 2px.
    Для однострочных вертикальных баблов позволяет лучу дойти до боковых стенок овала.
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

        # Только если текст тянется на треть всей страницы — это техническая сноска на полях
        is_giant_page_strip = (bh > img_h * 0.35)

        # Комфортный размах лучей:
        # Для однострочного японского текста бабл может быть широким овалом,
        # поэтому запас хода луча масштабируется от высоты bh (до 85px в каждую сторону)
        if is_giant_page_strip:
            max_expand_x = min(20, max(6, int(bw * 0.25)))
        else:
            max_expand_x = min(85, max(30, int(bh * 0.38)))

        max_expand_y = min(20, max(6, int(bh * 0.12)))

        # Вычисляем физические пределы, чтобы не залезть на соседние баблы
        hard_limit_left = 2
        hard_limit_right = img_w - 2
        hard_limit_top = 2
        hard_limit_bottom = img_h - 2

        if other_boxes:
            cx = (x1 + x2) // 2
            for ox1, oy1, ox2, oy2 in other_boxes:
                # Если боксы перекрываются по вертикали более чем на 8px
                if min(y2, oy2) - max(y1, oy1) > 8:
                    ocx = (ox1 + ox2) // 2
                    if ocx < cx:
                        hard_limit_left = max(hard_limit_left, ox2 + 2)
                    elif ocx > cx:
                        hard_limit_right = min(hard_limit_right, ox1 - 2)

        # Внутренний срез по высоте (сканируем по центральной части текста)
        y_slice_start = int(y1 + bh * 0.22)
        y_slice_end = int(y2 - bh * 0.22)
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
            # Останавливаемся при встрече чернильного контура бабла
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

        # Отступ внутрь от найденной чернильной стенки (2px)
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

        px1 = max(0.0, ex1 / img_width)
        py1 = max(0.0, ey1 / img_height)
        px2 = min(1.0, ex2 / img_width)
        py2 = min(1.0, ey2 / img_height)

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
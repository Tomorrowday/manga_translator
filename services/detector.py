from typing import List, Dict
from PIL import Image
from ml.models import ml


def manga_sort_key(box: Dict[str, float]) -> tuple:
    """
    Ключ сортировки в японском порядке чтения (Manga Reading Order):
    1. Сверху вниз по вертикальным ярусам (кадрам).
    2. Внутри одного яруса — строго СПРАВА НАЛЕВО (по убыванию координаты X).
    """
    row_height = 0.18  # Высота одного условного яруса кадров (~18% высоты страницы)
    row_idx = int(box["y"] / row_height)

    # row_idx — возрастает (сверху вниз)
    # -box["x"] — убывает (справа налево: чем больше x, тем первее бабл)
    return (row_idx, -box["x"])


def detect_and_filter_bubbles(image: Image.Image, padding: int = 6) -> List[Dict[str, float]]:
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

    # Приведение к относительным координатам
    boxes = []
    for x1, y1, x2, y2 in filtered_boxes:
        px1 = max(0, x1 - padding) / img_width
        py1 = max(0, y1 - padding) / img_height
        px2 = min(img_width, x2 + padding) / img_width
        py2 = min(img_height, y2 + padding) / img_height

        boxes.append({
            "x": px1,
            "y": py1,
            "width": px2 - px1,
            "height": py2 - py1
        })

    # Сортируем баблы в правильном японском порядке чтения
    boxes.sort(key=manga_sort_key)

    # Проставляем order_index (от 1 до N)
    for idx, b in enumerate(boxes):
        b["order_index"] = idx + 1

    return boxes
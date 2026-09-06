import cv2
import numpy as np


def clean_speech_bubble(image_np: np.ndarray, box: dict) -> None:
    """
    Умный клин манги через OpenCV:
    Находит внутренность бабла и выбеливает её в чистый #FFFFFF,
    сохраняя контуры рамки и окружающий арт нетронутыми.

    :param image_np: Исходное BGR-изображение (модифицируется inplace)
    :param box: Словарь относительных координат {'x', 'y', 'width', 'height'}
    """
    img_h, img_w = image_np.shape[:2]

    # Перевод относительных координат (0..1) в абсолютные пиксели
    x1 = int(max(0, box["x"] * img_w))
    y1 = int(max(0, box["y"] * img_h))
    x2 = int(min(img_w, (box["x"] + box["width"]) * img_w))
    y2 = int(min(img_h, (box["y"] + box["height"]) * img_h))

    roi = image_np[y1:y2, x1:x2]
    if roi.size == 0:
        return

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # 1. Бинаризация: инвертируем тёмные пиксели (текст и границы)
    _, dark_mask = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY_INV)

    # 2. Поиск связных контуров внутри бабла
    contours, _ = cv2.findContours(dark_mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    # 3. Фильтрация текста: исключаем контуры, касающиеся внешних краёв бабла
    h_roi, w_roi = roi.shape[:2]
    margin = max(2, int(min(h_roi, w_roi) * 0.04))
    text_clean_mask = np.zeros_like(gray)

    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)
        # Если контур полностью лежит внутри с отступом margin — это текст
        if cx > margin and cy > margin and (cx + cw) < (w_roi - margin) and (cy + ch) < (h_roi - margin):
            cv2.drawContours(text_clean_mask, [cnt], -1, 255, thickness=cv2.FILLED)

    # 4. Дилатация маски: убираем серые артефакты сглаживания вокруг букв
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    text_clean_mask = cv2.dilate(text_clean_mask, kernel, iterations=2)

    # 5. Выбеливание текста
    roi[text_clean_mask == 255] = [255, 255, 255]

    # 6. Дополнительное осветление желтизны бумаги и шума сканера
    light_paper_mask = (gray > 215) & (text_clean_mask == 0)
    inner_box = np.zeros_like(gray, dtype=bool)
    inner_box[margin:-margin, margin:-margin] = True
    roi[light_paper_mask & inner_box] = [255, 255, 255]

    image_np[y1:y2, x1:x2] = roi
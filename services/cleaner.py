import cv2
import numpy as np
from PIL import Image
from ml.models import ml


def is_mostly_white_bubble(roi: np.ndarray, gray: np.ndarray) -> bool:
    """
    Строгая интеллектуальная проверка: является ли область чистым белым баблом.
    Если есть малейшие признаки арта, скринтона, полутонов или текстуры —
    возвращает False, отдавая предпочтение AI-ретуши через LaMa.
    """
    total_pixels = gray.size
    if total_pixels == 0:
        return False

    # 1. Процент истинно белого цвета во ВСЁМ кропе
    pure_white_ratio = np.mean(gray >= 238)
    if pure_white_ratio < 0.70:
        return False

    # 2. Наличие серых полутонов (маркер скринтона, градиента и рисунка)
    midtones_ratio = np.mean((gray >= 70) & (gray <= 215))
    if midtones_ratio > 0.09:
        return False

    # 3. Разброс (стандартное отклонение) яркости светлого фона
    light_pixels = gray[gray >= 200]
    if light_pixels.size > 0:
        std_val = np.std(light_pixels)
        if std_val > 12.0:
            return False

    # 4. Общая интегральная яркость кропа
    overall_mean = np.mean(gray)
    if overall_mean < 215:
        return False

    return True


def clean_white_bubble(
    image_np: np.ndarray,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    roi: np.ndarray,
    gray: np.ndarray,
    shape: str = "rect"
):
    """
    Идеальная чистка белого бабла любой формы (прямоугольник или овал):
    - Стирает буквы, точки, дакутэн (が, ば), тире и кавычки.
    - ЖЕЛЕЗНО сохраняет контур и рамку бабла даже при свободном 8-точечном ресайзе
      (защищает скругленные стенки овала от случайного выбеливания).
    """
    h_roi, w_roi = roi.shape[:2]
    if h_roi < 3 or w_roi < 3:
        return

    # Порог для поиска всех тёмных элементов
    _, dark_mask = cv2.threshold(gray, 195, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(dark_mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    text_clean_mask = np.zeros_like(gray)
    border_mask = np.zeros_like(gray)

    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)

        # Проверка 1: Касается ли объект края кропа
        touches_edge = (cx <= 3 or cy <= 3 or (cx + cw) >= w_roi - 3 or (cy + ch) >= h_roi - 3)

        # Проверка 2 (Критично для ОВАЛОВ): Овальный контур может не касаться углов прямоугольника,
        # но охватывает более 70% габаритов кропа.
        is_large_enclosing_contour = (cw >= w_roi * 0.70 and ch >= h_roi * 0.70)

        if touches_edge or (shape == "ellipse" and is_large_enclosing_contour):
            # ЭТО КОНТУР БАБЛА (овальный или прямоугольный) ИЛИ ВНЕШНИЙ АРТ!
            cv2.drawContours(border_mask, [cnt], -1, 255, thickness=cv2.FILLED)
        else:
            # ЭТО ПЛАВАЮЩИЙ ВНУТРИ ТЕКСТ (буквы, иероглифы, знаки)
            cv2.drawContours(text_clean_mask, [cnt], -1, 255, thickness=cv2.FILLED)

    # Если текста не найдено
    if np.sum(text_clean_mask) == 0:
        return

    # Расширяем маску стирания на 2 пикселя, чтобы начисто убрать серые полутона антиалиасинга
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dilated_text = cv2.dilate(text_clean_mask, kernel, iterations=1)

    # Защитный щит контура: вычитаем рамку из маски стирания с небольшим запасом безопасности
    border_shield = cv2.dilate(border_mask, kernel, iterations=1)
    dilated_text[border_shield == 255] = 0

    # Выбеливаем только подтвержденные штрихи букв
    roi[dilated_text == 255] = [255, 255, 255]

    image_np[y1:y2, x1:x2] = roi


def inpaint_with_lama(image_np: np.ndarray, x1: int, y1: int, x2: int, y2: int, text_clean_mask: np.ndarray):
    """
    Ретушь сложных участков арта и скринтонов через LaMa AI.
    """
    img_h, img_w = image_np.shape[:2]
    box_w = x2 - x1
    box_h = y2 - y1

    pad = max(60, min(100, int(max(box_w, box_h) * 0.45)))
    cx1 = max(0, x1 - pad)
    cy1 = max(0, y1 - pad)
    cx2 = min(img_w, x2 + pad)
    cy2 = min(img_h, y2 + pad)

    target_h = cy2 - cy1
    target_w = cx2 - cx1

    crop_bgr = image_np[cy1:cy2, cx1:cx2]

    crop_mask = np.zeros((target_h, target_w), dtype=np.uint8)
    ox1 = x1 - cx1
    oy1 = y1 - cy1
    crop_mask[oy1:oy1 + box_h, ox1:ox1 + box_w] = text_clean_mask

    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    crop_mask = cv2.dilate(crop_mask, dilate_kernel, iterations=1)

    crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    crop_pil = Image.fromarray(crop_rgb)
    mask_pil = Image.fromarray(crop_mask)

    inpainted_pil = ml.inpaint_model(crop_pil, mask_pil)
    inpainted_bgr = cv2.cvtColor(np.array(inpainted_pil), cv2.COLOR_RGB2BGR)

    if inpainted_bgr.shape[0] != target_h or inpainted_bgr.shape[1] != target_w:
        inpainted_bgr = inpainted_bgr[:target_h, :target_w]
        if inpainted_bgr.shape[:2] != (target_h, target_w):
            inpainted_bgr = cv2.resize(inpainted_bgr, (target_w, target_h))

    inpainted_gray = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2GRAY)
    inpainted_clean = cv2.cvtColor(inpainted_gray, cv2.COLOR_GRAY2BGR)

    image_np[cy1:cy2, cx1:cx2] = inpainted_clean


def clean_speech_bubble(image_np: np.ndarray, box: dict) -> str:
    """
    Единая точка входа для клина:
    Автоматически разделяет белые баблы и сложный арт с приоритетом качества.
    Учитывает форму (shape: "rect" | "ellipse").
    """
    img_h, img_w = image_np.shape[:2]

    x1 = int(max(0, box["x"] * img_w))
    y1 = int(max(0, box["y"] * img_h))
    x2 = int(min(img_w, (box["x"] + box["width"]) * img_w))
    y2 = int(min(img_h, (box["y"] + box["height"]) * img_h))

    roi = image_np[y1:y2, x1:x2]
    if roi.size == 0:
        return "skipped"

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    shape = box.get("shape", "rect")

    # 1. СТРОГАЯ проверка: чистый белый бабл -> быстрое выбеливание букв с защитой формы
    if is_mostly_white_bubble(roi, gray):
        clean_white_bubble(image_np, x1, y1, x2, y2, roi, gray, shape=shape)
        return "white"

    # 2. Если есть хоть малейший скринтон, арт или текстура -> отдаем нейросети LaMa
    h_roi, w_roi = roi.shape[:2]
    margin = max(2, int(min(h_roi, w_roi) * 0.04))

    _, dark_mask = cv2.threshold(gray, 175, 255, cv2.THRESH_BINARY_INV)

    text_clean_mask = np.zeros_like(gray)
    text_clean_mask[margin:h_roi - margin, margin:w_roi - margin] = dark_mask[margin:h_roi - margin, margin:w_roi - margin]

    if np.sum(text_clean_mask) < 20:
        text_clean_mask[margin:h_roi - margin, margin:w_roi - margin] = 255

    if ml.inpaint_model is None:
        clean_white_bubble(image_np, x1, y1, x2, y2, roi, gray, shape=shape)
        return "white"

    try:
        inpaint_with_lama(image_np, x1, y1, x2, y2, text_clean_mask)
        return "inpaint"
    except Exception as e:
        print(f"Ошибка LaMa: {e}, откат к белому клину")
        clean_white_bubble(image_np, x1, y1, x2, y2, roi, gray, shape=shape)
        return "white"


def spot_clean_region(image_np: np.ndarray, box: dict, method: str = "auto") -> str:
    """
    Точечная очистка конкретной прямоугольной области поверх существующего скана:
    - 'auto': умный выбор (белый бабл или LaMa)
    - 'lama': принудительная ретушь арта/скринтона нейросетью LaMa
    - 'white': выбеливание строго с защитой контура бабла
    """
    img_h, img_w = image_np.shape[:2]

    x1 = int(max(0, box["x"] * img_w))
    y1 = int(max(0, box["y"] * img_h))
    x2 = int(min(img_w, (box["x"] + box["width"]) * img_w))
    y2 = int(min(img_h, (box["y"] + box["height"]) * img_h))

    roi = image_np[y1:y2, x1:x2]
    if roi.size == 0:
        return "skipped"

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    shape = box.get("shape", "rect")

    if method == "white":
        clean_white_bubble(image_np, x1, y1, x2, y2, roi, gray, shape=shape)
        return "white"

    if method == "lama":
        if ml.inpaint_model is None:
            clean_white_bubble(image_np, x1, y1, x2, y2, roi, gray, shape=shape)
            return "white"

        mask = np.full(gray.shape, 255, dtype=np.uint8)
        inpaint_with_lama(image_np, x1, y1, x2, y2, mask)
        return "inpaint"

    # method == "auto"
    return clean_speech_bubble(image_np, box)
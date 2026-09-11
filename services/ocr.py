import math
from PIL import Image
from ml.models import ml


def ocr_image_region(
        image: Image.Image,
        x: float,
        y: float,
        width: float,
        height: float,
        rotation: float = 0.0
) -> str:
    """
    Вырезает область бабла по относительным координатам (0..1) с учетом угла поворота
    и распознает японский текст через MangaOCR.

    Если угол rotation != 0 (в градусах по часовой стрелке), изображение поворачивается
    на rotation против часовой стрелки вокруг центра бабла, выравнивая текст строго
    вертикально/горизонтально для 100% точности распознавания MangaOCR.
    """
    if ml.mocr is None:
        raise RuntimeError("MangaOCR не инициализирована")

    img_w, img_h = image.size

    cx = (x + width / 2.0) * img_w
    cy = (y + height / 2.0) * img_h
    bw = max(2, int(width * img_w))
    bh = max(2, int(height * img_h))

    # Если угол отсутствует или ничтожно мал — стандартный быстрый crop
    if abs(rotation) < 0.5:
        x1 = max(0, int(x * img_w))
        y1 = max(0, int(y * img_h))
        x2 = min(img_w, x1 + bw)
        y2 = min(img_h, y1 + bh)

        if x2 <= x1 or y2 <= y1:
            return ""

        crop_img = image.crop((x1, y1, x2, y2))
        return ml.mocr(crop_img).strip()

    # Если задан поворот:
    # 1. Извлекаем подкроп, описывающий окружность вокруг центра
    radius = math.ceil(math.sqrt(bw * bw + bh * bh) / 2.0) + 4
    sub_x1 = max(0, int(cx - radius))
    sub_y1 = max(0, int(cy - radius))
    sub_x2 = min(img_w, int(cx + radius))
    sub_y2 = min(img_h, int(cy + radius))

    if sub_x2 <= sub_x1 or sub_y2 <= sub_y1:
        return ""

    sub_crop = image.crop((sub_x1, sub_y1, sub_x2, sub_y2))

    local_cx = cx - sub_x1
    local_cy = cy - sub_y1

    # 2. Выравниваем текст: поворачиваем sub_crop вокруг (local_cx, local_cy)
    # В PIL rotate() положительный угол крутит против часовой стрелки,
    # что в точности компенсирует положительный CSS-поворот по часовой стрелке.
    rotated_sub = sub_crop.rotate(
        rotation,
        resample=Image.BICUBIC,
        center=(local_cx, local_cy),
        fillcolor=(255, 255, 255)
    )

    # 3. Вырезаем выровненный прямоугольник размером bw x bh
    rx1 = max(0, int(local_cx - bw / 2.0))
    ry1 = max(0, int(local_cy - bh / 2.0))
    rx2 = min(rotated_sub.width, rx1 + bw)
    ry2 = min(rotated_sub.height, ry1 + bh)

    if rx2 <= rx1 or ry2 <= ry1:
        return ""

    final_crop = rotated_sub.crop((rx1, ry1, rx2, ry2))
    return ml.mocr(final_crop).strip()
# services/page_service.py
# Бизнес-логика работы со страницей: блоки, сохранение, клин и автодетект

import os
import time
import uuid
from typing import List, Dict, Any, Tuple
import cv2
import numpy as np
from PIL import Image

from database import get_db, db_session
from schemas import TextBlockItem
from services.cleaner import clean_speech_bubble
from services.detector import detect_and_filter_bubbles
from services.ocr import ocr_image_region
from logger import logger


def save_page_blocks_service(page_id: int, blocks: List[TextBlockItem]) -> str:
    """Сохраняет блоки страницы с валидацией координат и вычисляет новый статус страницы."""
    with db_session() as cursor:
        cursor.execute("SELECT status, clean_path FROM pages WHERE id = ?", (page_id,))
        page_row = cursor.fetchone()
        if not page_row:
            raise ValueError("Страница не найдена")

        current_status = str(page_row["status"])
        cursor.execute("DELETE FROM text_blocks WHERE page_id = ?", (page_id,))

        for idx, b in enumerate(blocks):
            current_order = b.order_index if b.order_index else (idx + 1)
            shape_val = b.shape if b.shape in ["rect", "ellipse"] else "rect"
            pad_mode = b.padding_mode if b.padding_mode in ["safe", "fit"] else "safe"

            clamped_x = max(0.0, min(0.995, float(b.x)))
            clamped_y = max(0.0, min(0.995, float(b.y)))
            clamped_w = max(0.005, min(1.0 - clamped_x, float(b.width)))
            clamped_h = max(0.005, min(1.0 - clamped_y, float(b.height)))

            raw_rot = float(b.rotation or 0.0)
            normalized_rot = ((raw_rot + 180.0) % 360.0) - 180.0

            cursor.execute(
                """
                INSERT INTO text_blocks (
                    id, page_id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index,
                    font_size, font_family, is_bold, is_italic, is_uppercase, has_stroke,
                    shape, padding_mode, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    b.id, page_id, clamped_x, clamped_y, clamped_w, clamped_h, round(normalized_rot, 2),
                    b.jap_text, b.rus_text, b.speaker,
                    current_order, b.font_size, b.font_family, int(b.is_bold or False),
                    int(b.is_italic or False), int(b.is_uppercase or False),
                    int(b.has_stroke or False), shape_val, pad_mode, b.status
                )
            )

        has_rus = any(bool(b.rus_text and b.rus_text.strip()) for b in blocks)
        clean_path_val = str(page_row["clean_path"]) if page_row["clean_path"] else ""

        if current_status == "done":
            page_status = "done"
        elif clean_path_val and os.path.exists(clean_path_val):
            page_status = "cleaned"
        elif has_rus:
            page_status = "translated"
        elif blocks:
            page_status = "detected"
        else:
            page_status = "raw"

        cursor.execute("UPDATE pages SET status = ? WHERE id = ?", (page_status, page_id))

    return page_status


def detect_page_bubbles_service(page_id: int) -> Tuple[List[Dict[str, Any]], str, float]:
    """Выполняет YOLO-детекцию и первичный MangaOCR для страницы."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, status FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row or not os.path.exists(str(row["file_path"])):
        raise ValueError("Файл не найден на диске")

    file_path = str(row["file_path"])
    current_status = str(row["status"])

    start_time = time.time()
    image = Image.open(file_path).convert("RGB")
    raw_boxes = detect_and_filter_bubbles(image)

    # Приводим словари к универсальному типу Dict[str, Any], чтобы можно было хранить текст и статус
    boxes: List[Dict[str, Any]] = [dict(b) for b in raw_boxes]

    with db_session() as cur:
        cur.execute("DELETE FROM text_blocks WHERE page_id = ?", (page_id,))
        for b in boxes:
            block_id = str(uuid.uuid4())
            b["id"] = block_id
            b["shape"] = "rect"
            b["padding_mode"] = "safe"
            b["rotation"] = 0.0

            jap_text = ocr_image_region(
                image,
                float(b["x"]),
                float(b["y"]),
                float(b["width"]),
                float(b["height"]),
                rotation=0.0
            )
            b["jap_text"] = jap_text
            b["status"] = "ocr-done" if jap_text else "new"

            cur.execute(
                """
                INSERT INTO text_blocks (
                    id, page_id, x, y, width, height, rotation, jap_text, order_index, shape, padding_mode, status
                )
                VALUES (?, ?, ?, ?, ?, ?, 0.0, ?, ?, 'rect', 'safe', ?)
                """,
                (block_id, page_id, b["x"], b["y"], b["width"], b["height"], jap_text, b["order_index"], b["status"])
            )

        new_status = "detected" if boxes else "raw"
        if current_status not in ["translated", "cleaned", "done"]:
            cur.execute("UPDATE pages SET status = ? WHERE id = ?", (new_status, page_id))

    elapsed = round(time.time() - start_time, 4)
    return boxes, new_status, elapsed


def clean_page_bubbles_service(page_id: int) -> Tuple[str, str, Dict[str, int]]:
    """Очищает баблы на странице (белый клин + LaMa inpainting)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row or not os.path.exists(str(page_row["file_path"])):
        conn.close()
        raise ValueError("Файл страницы не найден")

    cursor.execute("SELECT x, y, width, height, shape, rotation FROM text_blocks WHERE page_id = ?", (page_id,))
    boxes = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not boxes:
        raise ValueError("Нет размеченных баблов для очистки")

    orig_path = str(page_row["file_path"])
    raw_cv_img = cv2.imread(orig_path)
    if raw_cv_img is None:
        raise RuntimeError("Не удалось открыть картинку через OpenCV")

    image: np.ndarray = raw_cv_img

    stats = {"white": 0, "inpaint": 0}
    for box in boxes:
        method = clean_speech_bubble(image, box)
        if method in stats:
            stats[method] += 1

    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    clean_path = str(os.path.join(clean_dir, f"{file_name}.png"))
    cv2.imwrite(clean_path, image)

    page_status_str = str(page_row["status"])
    new_status = "done" if page_status_str == "done" else "cleaned"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = ?, status = ? WHERE id = ?", (clean_path, new_status, page_id))

    return clean_path, new_status, stats


def revert_page_clean_service(page_id: int) -> str:
    """Откатывает клин страницы, удаляя заклиненный файл."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, clean_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row:
        conn.close()
        raise ValueError("Страница не найдена")

    clean_path_raw = page_row["clean_path"]
    if clean_path_raw:
        clean_path = str(clean_path_raw)
        if os.path.exists(clean_path):
            try:
                os.remove(clean_path)
                logger.info(f"Файл клина удален: {clean_path}")
            except Exception as e:
                logger.warning(f"Не удалось удалить файл {clean_path}: {e}")

    cursor.execute("SELECT jap_text, rus_text FROM text_blocks WHERE page_id = ?", (page_id,))
    blocks = cursor.fetchall()
    conn.close()

    has_rus = any(bool(b["rus_text"] and b["rus_text"].strip()) for b in blocks)
    new_status = "translated" if has_rus else "detected" if blocks else "raw"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = NULL, status = ? WHERE id = ?", (new_status, page_id))

    return new_status
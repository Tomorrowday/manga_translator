# services/page_service.py
# Бизнес-логика работы со страницей с чтением из единых глобальных настроек

import os
import time
import uuid
from typing import List, Dict, Any, Tuple, Optional
import cv2
import numpy as np
from PIL import Image

from database import get_db, db_session
from schemas import TextBlockItem
from services.cleaner import clean_speech_bubble, load_image_cv2, release_vram
from services.detector import detect_and_filter_bubbles
from services.ocr import ocr_image_region
from logger import logger


def get_active_global_settings() -> Dict[str, Any]:
    """Считывает актуальные глобальные настройки из БД."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM global_settings WHERE id = 1")
    row = cur.fetchone()
    conn.close()

    if row:
        return dict(row)
    return {
        "default_font_size": 14,
        "detector_model": "yolo_manga.pt",
        "clean_model": "anime-manga-big-lama.pt",
        "detect_conf": 0.25,
        "auto_oval_bubble": 1,
        "default_padding": "safe",
        "default_hyphenation": 1,
        "font_bubble": "v_CCFaceFront",
        "font_thought": "v_CCFaceFront",
        "font_sfx": "v_Mighty Zeo 2.0"
    }


def save_page_blocks_service(page_id: int, blocks: List[TextBlockItem]) -> str:
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
            min_hyphens_val = 1 if b.min_hyphens is None or b.min_hyphens else 0
            text_color_val = "white" if b.text_color == "white" else "black"
            class_id_val = int(b.class_id or 0)

            clamped_x = max(0.0, min(0.995, float(b.x)))
            clamped_y = max(0.0, min(0.995, float(b.y)))
            clamped_w = max(0.005, min(1.0 - clamped_x, float(b.width)))
            clamped_h = max(0.005, min(1.0 - clamped_y, float(b.height)))

            raw_rot = float(b.rotation or 0.0)
            normalized_rot = ((raw_rot + 180.0) % 360.0) - 180.0

            cursor.execute(
                """
                INSERT OR REPLACE INTO text_blocks (
                    id, page_id, class_id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index,
                    font_size, font_family, is_bold, is_italic, is_uppercase, has_stroke,
                    text_color, shape, padding_mode, min_hyphens, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    b.id, page_id, class_id_val, clamped_x, clamped_y, clamped_w, clamped_h, round(normalized_rot, 2),
                    b.jap_text, b.rus_text, b.speaker,
                    current_order, b.font_size, b.font_family, int(b.is_bold or False),
                    int(b.is_italic or False), int(b.is_uppercase or False),
                    int(b.has_stroke or False), text_color_val, shape_val, pad_mode, min_hyphens_val, b.status
                )
            )

        has_rus = any(bool(b.rus_text and b.rus_text.strip()) for b in blocks)
        clean_path_val = str(page_row["clean_path"]) if page_row["clean_path"] else ""
        has_clean = bool(clean_path_val and os.path.exists(clean_path_val))

        if current_status == "done":
            page_status = "done"
        elif has_rus:
            page_status = "translated"
        elif has_clean:
            page_status = "cleaned"
        elif blocks:
            page_status = "detected"
        elif current_status in ["detected", "cleaned", "translated"]:
            page_status = "detected"
        else:
            page_status = "raw"

        cursor.execute("UPDATE pages SET status = ? WHERE id = ?", (page_status, page_id))

    return page_status


def detect_page_bubbles_service(
    page_id: int,
    conf_override: Optional[float] = None,
    auto_oval_override: Optional[bool] = None
) -> Tuple[List[Dict[str, Any]], str, float]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, status FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row or not os.path.exists(str(row["file_path"])):
        raise ValueError("Файл не найден на диске")

    file_path = str(row["file_path"])
    current_status = str(row["status"])

    # Считываем глобальные настройки приложения
    cfg = get_active_global_settings()

    detector_model = cfg.get("detector_model") or "yolo_manga.pt"
    detect_conf = conf_override if conf_override is not None else float(cfg.get("detect_conf", 0.25))

    raw_auto_oval = cfg.get("auto_oval_bubble")
    is_auto_oval_enabled = bool(raw_auto_oval) if raw_auto_oval is not None else True
    auto_oval = auto_oval_override if auto_oval_override is not None else is_auto_oval_enabled

    default_pad = cfg.get("default_padding") or "safe"
    default_hyph = bool(cfg.get("default_hyphenation", 1))
    default_font_size = int(cfg.get("default_font_size", 14))

    font_bubble = cfg.get("font_bubble") or "v_CCFaceFront"
    font_thought = cfg.get("font_thought") or "v_CCFaceFront"
    font_sfx = cfg.get("font_sfx") or "v_Mighty Zeo 2.0"

    start_time = time.time()
    image = Image.open(file_path).convert("RGB")

    raw_boxes = detect_and_filter_bubbles(
        image,
        model_name=detector_model,
        conf_threshold=float(detect_conf)
    )
    boxes: List[Dict[str, Any]] = [dict(b) for b in raw_boxes]

    with db_session() as cur:
        cur.execute("DELETE FROM text_blocks WHERE page_id = ?", (page_id,))
        for b in boxes:
            block_id = str(uuid.uuid4())
            cls_id = int(b.get("class_id", 0))

            # Авто-овал: для обычных баблов речи (класс 0) ставим овал
            if cls_id == 0 and auto_oval:
                block_shape = "ellipse"
            else:
                block_shape = "rect"

            # Стандартный шрифт по классу
            if cls_id == 0:
                block_font = font_bubble
            elif cls_id == 1:
                block_font = font_thought
            else:
                block_font = font_sfx

            b["id"] = block_id
            b["class_id"] = cls_id
            b["shape"] = block_shape
            b["font_family"] = block_font
            b["font_size"] = default_font_size
            b["padding_mode"] = default_pad
            b["min_hyphens"] = default_hyph
            b["text_color"] = "black"
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
                INSERT OR REPLACE INTO text_blocks (
                    id, page_id, class_id, x, y, width, height, rotation, jap_text, order_index, 
                    font_size, font_family, text_color, shape, padding_mode, min_hyphens, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, 'black', ?, ?, ?, ?)
                """,
                (
                    block_id, page_id, cls_id, b["x"], b["y"], b["width"], b["height"], jap_text, b["order_index"],
                    default_font_size, block_font, block_shape, default_pad, int(default_hyph), b["status"]
                )
            )

        new_status = "detected" if boxes else "raw"
        if current_status not in ["cleaned", "translated", "done"]:
            cur.execute("UPDATE pages SET status = ? WHERE id = ?", (new_status, page_id))
        else:
            new_status = current_status

    elapsed = round(time.time() - start_time, 4)
    return boxes, new_status, elapsed


def clean_page_bubbles_service(page_id: int, clean_mode: str = "auto") -> Tuple[str, str, Dict[str, int]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row or not os.path.exists(str(page_row["file_path"])):
        conn.close()
        raise ValueError("Файл страницы не найден")

    # Считываем глобальную модель клина
    cfg = get_active_global_settings()
    clean_model_name = cfg.get("clean_model") or "anime-manga-big-lama.pt"

    cursor.execute(
        "SELECT x, y, width, height, shape, rotation, rus_text, class_id FROM text_blocks WHERE page_id = ?",
        (page_id,)
    )
    blocks = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not blocks:
        raise ValueError("Нет размеченных баблов для очистки")

    orig_path = str(page_row["file_path"])
    try:
        image: np.ndarray = load_image_cv2(orig_path)
    except Exception as e:
        raise RuntimeError(f"Не удалось открыть изображение: {e}")

    stats = {"white": 0, "inpaint": 0}
    try:
        for box in blocks:
            method = clean_speech_bubble(image, box, force_mode=clean_mode, clean_model_name=clean_model_name)
            if method in stats:
                stats[method] += 1
    finally:
        release_vram()

    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    clean_path = str(os.path.join(clean_dir, f"{file_name}.png"))
    cv2.imwrite(clean_path, image)

    page_status_str = str(page_row["status"])
    has_rus = any(bool(b.get("rus_text") and b["rus_text"].strip()) for b in blocks)

    if page_status_str == "done":
        new_status = "done"
    elif has_rus or page_status_str == "translated":
        new_status = "translated"
    else:
        new_status = "cleaned"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = ?, status = ? WHERE id = ?", (clean_path, new_status, page_id))

    return clean_path, new_status, stats


def revert_page_clean_service(page_id: int) -> str:
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
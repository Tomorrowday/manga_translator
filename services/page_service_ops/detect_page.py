# services/page_service_ops/detect_page.py
# Автодетект баблов на странице через YOLO + OCR японского текста

import os
import time
import uuid
from typing import List, Dict, Any, Tuple, Optional

from PIL import Image

from database import get_db, db_session
from services.cleaner import release_vram
from services.detector import detect_and_filter_bubbles
from services.ocr import ocr_image_region
from services.page_service_ops.active_settings import get_active_global_settings


def detect_page_bubbles_service(
    page_id: int,
    conf_override: Optional[float] = None,
    auto_oval_override: Optional[bool] = None
) -> Tuple[List[Dict[str, Any]], str, float]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path, status FROM pages WHERE id = ?", (page_id,))
        row = cursor.fetchone()

    if not row or not os.path.exists(str(row["file_path"])):
        raise ValueError("Файл не найден на диске")

    file_path = str(row["file_path"])
    current_status = str(row["status"])

    cfg = get_active_global_settings()
    detector_model = cfg.get("detector_model") or "yolo_manga.pt"
    detect_conf = conf_override if conf_override is not None else float(cfg.get("detect_conf", 0.25))
    detect_sfx = bool(cfg.get("show_sfx", 0))

    default_pad = cfg.get("default_padding") or "safe"
    default_hyph = bool(cfg.get("default_hyphenation", 1))

    font_bubble = cfg.get("font_bubble") or "v_CCFaceFront"
    font_thought = cfg.get("font_thought") or "v_CCFaceFront"
    font_sfx = cfg.get("font_sfx") or "v_Mighty Zeo 2.0"

    start_time = time.time()
    try:
        image = Image.open(file_path).convert("RGB")

        raw_boxes = detect_and_filter_bubbles(
            image,
            model_name=detector_model,
            conf_threshold=float(detect_conf),
            detect_sfx=detect_sfx
        )
        boxes: List[Dict[str, Any]] = [dict(b) for b in raw_boxes]

        with db_session() as cur:
            cur.execute("DELETE FROM text_blocks WHERE page_id = ?", (page_id,))
            for b in boxes:
                block_id = str(uuid.uuid4())
                cls_id = int(b.get("class_id", 0))
                block_shape = "rect"

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
                b["font_size"] = None
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
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, NULL, ?, 'black', ?, ?, ?, ?)
                    """,
                    (
                        block_id, page_id, cls_id, b["x"], b["y"], b["width"], b["height"], jap_text, b["order_index"],
                        block_font, block_shape, default_pad, int(default_hyph), b["status"]
                    )
                )

            new_status = "detected" if boxes else "raw"
            if current_status not in ["cleaned", "translated", "done"]:
                cur.execute("UPDATE pages SET status = ? WHERE id = ?", (new_status, page_id))
            else:
                new_status = current_status

        elapsed = round(time.time() - start_time, 4)
        return boxes, new_status, elapsed
    finally:
        release_vram()

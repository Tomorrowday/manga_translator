# services/page_service_ops/save_blocks.py
# Сохранение баблов страницы с валидацией координат и пересчётом статуса страницы

import os
from typing import List

from database import db_session
from schemas import TextBlockItem


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

# services/chapter_service_ops/font_size.py
# Массовая установка кегля шрифта для всех блоков главы

from typing import Optional

from database import db_session
from logger import logger


def apply_font_size_to_chapter_service(chapter_id: int, font_size: Optional[int]) -> int:
    """Устанавливает конкретный размер кегля (или NULL для Auto) всем баблам главы."""
    with db_session() as cur:
        cur.execute(
            """
            UPDATE text_blocks
            SET font_size = ?
            WHERE page_id IN (SELECT id FROM pages WHERE chapter_id = ?)
            """,
            (font_size, chapter_id)
        )
        affected = cur.rowcount
    logger.info(f"Для главы {chapter_id} обновлён кегль шрифта (size={font_size}) для {affected} блоков.")
    return affected

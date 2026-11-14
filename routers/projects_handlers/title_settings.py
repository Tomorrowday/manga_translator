from typing import Optional
from database import db_session, get_db
from schemas import UpdateTitleSettingsRequest


def update_title_settings(title_id: int, req: UpdateTitleSettingsRequest):
    """Обновить описание/синопсис и базовый размер шрифта тайтла."""
    with db_session() as cur:
        if req.description is not None:
            cur.execute("UPDATE titles SET description = ? WHERE id = ?", (req.description.strip(), title_id))
        if req.default_font_size is not None and 8 <= req.default_font_size <= 60:
            cur.execute("UPDATE titles SET default_font_size = ? WHERE id = ?", (int(req.default_font_size), title_id))

    return {
        "success": True,
        "description": req.description,
        "default_font_size": req.default_font_size
    }


def get_title_speakers(title_id: int, chapter_id: Optional[int] = None):
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT rus_word FROM glossary WHERE title_id = ?", (title_id,))
        glossary_speakers = [r["rus_word"].strip() for r in cursor.fetchall() if r["rus_word"] and r["rus_word"].strip()]

        if chapter_id:
            cursor.execute(
                """
                SELECT DISTINCT tb.speaker 
                FROM text_blocks tb
                JOIN pages p ON p.id = tb.page_id
                WHERE p.chapter_id = ? AND tb.speaker != ''
                """,
                (chapter_id,)
            )
        else:
            cursor.execute(
                """
                SELECT DISTINCT tb.speaker 
                FROM text_blocks tb
                JOIN pages p ON p.id = tb.page_id
                JOIN chapters c ON c.id = p.chapter_id
                WHERE c.title_id = ? AND tb.speaker != ''
                """,
                (title_id,)
            )
        used_speakers = [r["speaker"].strip() for r in cursor.fetchall() if r["speaker"] and r["speaker"].strip()]

    combined = []
    seen = set()
    for name in glossary_speakers + used_speakers:
        if name and name.lower() not in seen:
            seen.add(name.lower())
            combined.append(name)

    return {"success": True, "speakers": sorted(combined)}

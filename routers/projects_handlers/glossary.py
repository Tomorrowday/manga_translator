from fastapi import HTTPException
from database import db_session, get_db
from schemas import GlossaryItemCreate


def get_glossary(title_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM glossary WHERE title_id = ? ORDER BY id DESC", (title_id,))
        items = [dict(r) for r in cursor.fetchall()]
    return {"success": True, "items": items}


def add_glossary_item(title_id: int, req: GlossaryItemCreate):
    if not req.rus_word.strip():
        raise HTTPException(status_code=400, detail="Русское имя или обозначение персонажа обязательно")

    jap_word_clean = req.jap_word.strip() if req.jap_word else ""
    rus_word_clean = req.rus_word.strip()
    context_clean = req.context.strip() if req.context else ""

    with db_session() as cur:
        cur.execute(
            "INSERT INTO glossary (title_id, jap_word, rus_word, context) VALUES (?, ?, ?, ?)",
            (title_id, jap_word_clean, rus_word_clean, context_clean)
        )
        item_id = cur.lastrowid

    return {
        "success": True,
        "item": {
            "id": item_id,
            "title_id": title_id,
            "jap_word": jap_word_clean,
            "rus_word": rus_word_clean,
            "context": context_clean
        }
    }


def delete_glossary_item(title_id: int, entry_id: int):
    with db_session() as cur:
        cur.execute("DELETE FROM glossary WHERE id = ? AND title_id = ?", (entry_id, title_id))
    return {"success": True}

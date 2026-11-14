from fastapi import HTTPException
from database import db_session
from logger import logger


def delete_chapter(chapter_id: int):
    with db_session() as cur:
        cur.execute("SELECT id FROM chapters WHERE id = ?", (chapter_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Глава не найдена")
        cur.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))
    logger.info(f"Глава {chapter_id} успешно удалена из базы.")
    return {"success": True, "message": "Глава успешно удалена"}

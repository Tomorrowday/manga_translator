from typing import Dict, List, Any
from fastapi import HTTPException

from database import get_db
from config import natural_sort_key, get_available_detectors, get_available_cleaners
from logger import logger


def get_projects():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM titles ORDER BY created_at DESC")
        projects = [dict(row) for row in cursor.fetchall()]
    return {"success": True, "projects": projects}


def get_project_tree(title_id: int):
    """Загружает дерево тайтла без проблемы N+1 (одним пакетным запросом страниц)."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM titles WHERE id = ?", (title_id,))
        title_row = cursor.fetchone()
        if not title_row:
            return {"success": False, "error": "Тайтл не найден"}

        title = dict(title_row)

        cursor.execute("SELECT * FROM chapters WHERE title_id = ?", (title_id,))
        chapters = [dict(row) for row in cursor.fetchall()]
        chapters.sort(key=lambda c: natural_sort_key(c["chapter_number"]))

        if chapters:
            chapter_ids = [ch["id"] for ch in chapters]
            placeholders = ",".join("?" for _ in chapter_ids)
            cursor.execute(
                f"SELECT * FROM pages WHERE chapter_id IN ({placeholders}) ORDER BY page_number ASC",
                chapter_ids
            )
            pages_by_chapter: Dict[int, List[Dict[str, Any]]] = {}
            for p_row in cursor.fetchall():
                p_dict = dict(p_row)
                pages_by_chapter.setdefault(p_dict["chapter_id"], []).append(p_dict)

            for chapter in chapters:
                chapter["pages"] = pages_by_chapter.get(chapter["id"], [])
        else:
            for chapter in chapters:
                chapter["pages"] = []

    title["chapters"] = chapters
    title["available_detectors"] = get_available_detectors()
    title["available_cleaners"] = get_available_cleaners()
    return {"success": True, "title": title}


def delete_project(title_id: int):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM titles WHERE id = ?", (title_id,))
            conn.commit()
            conn.execute("VACUUM")
        return {"success": True, "message": "Проект успешно удалён"}
    except Exception as e:
        logger.error(f"Ошибка при удалении проекта {title_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

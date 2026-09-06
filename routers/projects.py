import os
from pathlib import Path
from fastapi import APIRouter
from database import db_session, get_db
from schemas import ScanProjectRequest

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.post("/scan")
async def scan_project(req: ScanProjectRequest):
    """Сканирует локальную папку на диске и добавляет тайтл, главы и страницы в БД."""
    folder = Path(req.folder_path)
    if not folder.exists() or not folder.is_dir():
        return {"success": False, "error": "Папка не найдена или путь указан неверно"}

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        with db_session() as cursor:
            # 1. Создаём тайтл
            cursor.execute("INSERT INTO titles (name, folder_path) VALUES (?, ?)", (req.name, str(folder)))
            title_id = cursor.lastrowid

            chapters_count = 0
            pages_count = 0

            # 2. Обходим подпапки (главы)
            for root, _, files in os.walk(folder):
                images = [f for f in files if Path(f).suffix.lower() in valid_extensions]
                if images:
                    images.sort()
                    chapter_name = Path(root).name

                    cursor.execute(
                        "INSERT INTO chapters (title_id, chapter_number, folder_path) VALUES (?, ?, ?)",
                        (title_id, chapter_name, root)
                    )
                    chapter_id = cursor.lastrowid
                    chapters_count += 1

                    for i, img in enumerate(images):
                        img_path = os.path.join(root, img)
                        cursor.execute(
                            "INSERT INTO pages (chapter_id, page_number, file_path) VALUES (?, ?, ?)",
                            (chapter_id, i + 1, img_path)
                        )
                        pages_count += 1

        return {
            "success": True,
            "message": f"Тайтл '{req.name}' добавлен! Глав: {chapters_count}, страниц: {pages_count}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("")
async def get_projects():
    """Возвращает список всех проектов (тайтлов)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM titles ORDER BY created_at DESC")
    projects = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"success": True, "projects": projects}


@router.get("/{title_id}/tree")
async def get_project_tree(title_id: int):
    """Возвращает иерархическое дерево: Тайтл -> Главы -> Страницы."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM titles WHERE id = ?", (title_id,))
    title_row = cursor.fetchone()
    if not title_row:
        conn.close()
        return {"success": False, "error": "Тайтл не найден"}

    title = dict(title_row)

    cursor.execute("SELECT * FROM chapters WHERE title_id = ? ORDER BY chapter_number", (title_id,))
    chapters = [dict(row) for row in cursor.fetchall()]

    for chapter in chapters:
        cursor.execute("SELECT * FROM pages WHERE chapter_id = ? ORDER BY page_number", (chapter["id"],))
        chapter["pages"] = [dict(row) for row in cursor.fetchall()]

    title["chapters"] = chapters
    conn.close()
    return {"success": True, "title": title}


@router.delete("/{title_id}")
async def delete_project(title_id: int):
    """Удаляет тайтл и все связанные данные каскадно."""
    with db_session() as cursor:
        cursor.execute("DELETE FROM titles WHERE id = ?", (title_id,))
    return {"success": True, "message": "Проект успешно удалён"}
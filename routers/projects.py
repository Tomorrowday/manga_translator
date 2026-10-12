# routers/projects.py

import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from database import db_session, get_db
from schemas import (
    ScanProjectRequest,
    AddChapterRequest,
    GlossaryItemCreate,
    UpdateTitleDescriptionRequest,
    UpdateTitleSettingsRequest,
)
from config import natural_sort_key
from logger import logger

router = APIRouter(prefix="/api/projects", tags=["Projects"])

# Поддерживаемые форматы графики (включая AVIF и JFIF)
VALID_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".avif"}

# Служебные папки, которые ни при каких условиях не должны распознаваться как главы манги
EXCLUDED_DIR_NAMES = {
    "clean", "cleaned", "translated", "export", "exports",
    "raw", ".git", ".idea", "__pycache__", "logs"
}


@router.post("/scan")
async def scan_project(req: ScanProjectRequest):
    folder = Path(req.folder_path)
    if not folder.exists() or not folder.is_dir():
        return {"success": False, "error": "Папка не найдена или путь указан неверно"}

    try:
        with db_session() as cursor:
            cursor.execute(
                "INSERT INTO titles (name, folder_path, default_font_size) VALUES (?, ?, 14)",
                (req.name, str(folder))
            )
            title_id = cursor.lastrowid

            chapters_count = 0
            pages_count = 0

            walk_dirs = []
            for root, dirs, files in os.walk(folder):
                dirs[:] = [d for d in dirs if d.lower() not in EXCLUDED_DIR_NAMES]
                walk_dirs.append((root, dirs, files))

            walk_dirs.sort(key=lambda item: natural_sort_key(item[0]))

            for root, _, files in walk_dirs:
                if Path(root).name.lower() in EXCLUDED_DIR_NAMES:
                    continue

                images = [f for f in files if Path(f).suffix.lower() in VALID_IMAGE_EXTENSIONS]
                if images:
                    images.sort(key=natural_sort_key)
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

        logger.info(f"Отсканирован проект '{req.name}': {chapters_count} глав, {pages_count} страниц.")
        return {
            "success": True,
            "message": f"Тайтл '{req.name}' добавлен! Глав: {chapters_count}, страниц: {pages_count}"
        }
    except Exception as e:
        logger.error(f"Ошибка сканирования папки: {e}")
        return {"success": False, "error": str(e)}


@router.post("/{title_id}/rescan")
async def rescan_project(title_id: int):
    """
    Повторный скан корневой папки тайтла на новые главы.
    Уже существующие в базе главы не затрагиваются (разметка и переводы сохраняются).
    Добавляются только новые найденные папки с изображениями.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, folder_path FROM titles WHERE id = ?", (title_id,))
    title_row = cursor.fetchone()

    if not title_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Тайтл не найден")

    title_name = title_row["name"]
    folder = Path(title_row["folder_path"])

    if not folder.exists() or not folder.is_dir():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Корневая папка тайтла не найдена: {folder}")

    cursor.execute("SELECT chapter_number, folder_path FROM chapters WHERE title_id = ?", (title_id,))
    existing_rows = cursor.fetchall()
    conn.close()

    existing_folders = {
        os.path.normpath(r["folder_path"]).lower()
        for r in existing_rows
        if r["folder_path"]
    }
    existing_names = {
        r["chapter_number"].strip().lower()
        for r in existing_rows
        if r["chapter_number"]
    }

    added_chapters = 0
    added_pages = 0
    skipped_chapters = 0

    try:
        walk_dirs = []
        for root, dirs, files in os.walk(folder):
            dirs[:] = [d for d in dirs if d.lower() not in EXCLUDED_DIR_NAMES]
            walk_dirs.append((root, dirs, files))

        walk_dirs.sort(key=lambda item: natural_sort_key(item[0]))

        with db_session() as cur:
            for root, _, files in walk_dirs:
                if Path(root).name.lower() in EXCLUDED_DIR_NAMES:
                    continue

                images = [f for f in files if Path(f).suffix.lower() in VALID_IMAGE_EXTENSIONS]
                if not images:
                    continue

                norm_root = os.path.normpath(root).lower()
                chapter_name = Path(root).name

                if norm_root in existing_folders or chapter_name.strip().lower() in existing_names:
                    skipped_chapters += 1
                    continue

                images.sort(key=natural_sort_key)
                cur.execute(
                    "INSERT INTO chapters (title_id, chapter_number, folder_path) VALUES (?, ?, ?)",
                    (title_id, chapter_name, root)
                )
                chapter_id = cur.lastrowid
                added_chapters += 1

                for i, img in enumerate(images):
                    img_path = os.path.join(root, img)
                    cur.execute(
                        "INSERT INTO pages (chapter_id, page_number, file_path) VALUES (?, ?, ?)",
                        (chapter_id, i + 1, img_path)
                    )
                    added_pages += 1

        logger.info(
            f"Рескан тайтла '{title_name}' (ID {title_id}): "
            f"добавлено глав: {added_chapters}, страниц: {added_pages}, пропущено существующих: {skipped_chapters}"
        )
        return {
            "success": True,
            "message": f"Скан завершён. Добавлено новых глав: {added_chapters} (страниц: {added_pages}). Пропущено: {skipped_chapters}.",
            "added_chapters": added_chapters,
            "added_pages": added_pages,
            "skipped_chapters": skipped_chapters,
        }
    except Exception as e:
        logger.error(f"Ошибка рескана проекта {title_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{title_id}/chapters")
async def add_chapters_to_title(title_id: int, req: AddChapterRequest):
    folder = Path(req.folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail="Папка не найдена или путь некорректен")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM titles WHERE id = ?", (title_id,))
    title_row = cursor.fetchone()
    conn.close()

    if not title_row:
        raise HTTPException(status_code=404, detail="Тайтл не найден")

    direct_files = [f for f in os.listdir(folder) if (folder / f).is_file()]
    direct_images = [f for f in direct_files if Path(f).suffix.lower() in VALID_IMAGE_EXTENSIONS]

    added_chapters = 0
    added_pages = 0

    try:
        with db_session() as cur:
            if direct_images:
                direct_images.sort(key=natural_sort_key)
                ch_name = req.chapter_number.strip() if req.chapter_number and req.chapter_number.strip() else folder.name

                cur.execute(
                    "INSERT INTO chapters (title_id, chapter_number, folder_path) VALUES (?, ?, ?)",
                    (title_id, ch_name, str(folder))
                )
                ch_id = cur.lastrowid
                added_chapters += 1

                for i, img in enumerate(direct_images):
                    cur.execute(
                        "INSERT INTO pages (chapter_id, page_number, file_path) VALUES (?, ?, ?)",
                        (ch_id, i + 1, str(folder / img))
                    )
                    added_pages += 1
            else:
                walk_dirs = []
                for root, dirs, files in os.walk(folder):
                    dirs[:] = [d for d in dirs if d.lower() not in EXCLUDED_DIR_NAMES]
                    walk_dirs.append((root, dirs, files))

                walk_dirs.sort(key=lambda item: natural_sort_key(item[0]))

                for root, _, files in walk_dirs:
                    if Path(root).name.lower() in EXCLUDED_DIR_NAMES:
                        continue

                    images = [f for f in files if Path(f).suffix.lower() in VALID_IMAGE_EXTENSIONS]
                    if images:
                        images.sort(key=natural_sort_key)
                        chapter_name = Path(root).name

                        cur.execute(
                            "INSERT INTO chapters (title_id, chapter_number, folder_path) VALUES (?, ?, ?)",
                            (title_id, chapter_name, root)
                        )
                        chapter_id = cur.lastrowid
                        added_chapters += 1

                        for i, img in enumerate(images):
                            img_path = os.path.join(root, img)
                            cur.execute(
                                "INSERT INTO pages (chapter_id, page_number, file_path) VALUES (?, ?, ?)",
                                (chapter_id, i + 1, img_path)
                            )
                            added_pages += 1

        if added_chapters == 0:
            raise HTTPException(
                status_code=400,
                detail="В указанной папке не найдено изображений (.jpg, .png, .webp, .jfif, .avif)"
            )

        logger.info(f"В тайтл '{title_row['name']}' (ID {title_id}) добавлено глав: {added_chapters}, страниц: {added_pages}")
        return {
            "success": True,
            "message": f"Добавлено глав: {added_chapters}, страниц: {added_pages}",
            "chapters_added": added_chapters,
            "pages_added": added_pages
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка добавления главы в тайтл {title_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def get_projects():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, folder_path, description, default_font_size, created_at FROM titles ORDER BY created_at DESC"
    )
    projects = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"success": True, "projects": projects}


@router.get("/{title_id}/tree")
async def get_project_tree(title_id: int):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, name, folder_path, description, default_font_size, created_at FROM titles WHERE id = ?",
        (title_id,)
    )
    title_row = cursor.fetchone()
    if not title_row:
        conn.close()
        return {"success": False, "error": "Тайтл не найден"}

    title = dict(title_row)
    if title.get("default_font_size") is None:
        title["default_font_size"] = 14

    cursor.execute("SELECT * FROM chapters WHERE title_id = ?", (title_id,))
    chapters = [dict(row) for row in cursor.fetchall()]
    chapters.sort(key=lambda c: natural_sort_key(c["chapter_number"]))

    for chapter in chapters:
        cursor.execute("SELECT * FROM pages WHERE chapter_id = ? ORDER BY page_number ASC", (chapter["id"],))
        chapter["pages"] = [dict(row) for row in cursor.fetchall()]

    title["chapters"] = chapters
    conn.close()
    return {"success": True, "title": title}


@router.put("/{title_id}/description")
async def update_title_description(title_id: int, req: UpdateTitleDescriptionRequest):
    with db_session() as cur:
        cur.execute("UPDATE titles SET description = ? WHERE id = ?", (req.description.strip(), title_id))
    logger.info(f"Обновлен синопсис для тайтла ID {title_id}")
    return {"success": True, "description": req.description.strip()}


@router.put("/{title_id}/settings")
async def update_title_settings(title_id: int, req: UpdateTitleSettingsRequest):
    font_size = req.default_font_size if (req.default_font_size and 8 <= req.default_font_size <= 40) else 14
    desc = req.description.strip() if req.description is not None else ""

    with db_session() as cur:
        cur.execute(
            "UPDATE titles SET description = ?, default_font_size = ? WHERE id = ?",
            (desc, font_size, title_id)
        )
    logger.info(f"Обновлены настройки для тайтла ID {title_id}: font_size={font_size}")
    return {"success": True, "description": desc, "default_font_size": font_size}


@router.get("/{title_id}/speakers")
async def get_title_speakers(title_id: int, chapter_id: Optional[int] = Query(None)):
    conn = get_db()
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
    conn.close()

    combined = []
    seen = set()
    for name in glossary_speakers + used_speakers:
        if name and name.lower() not in seen:
            seen.add(name.lower())
            combined.append(name)

    return {"success": True, "speakers": sorted(combined)}


@router.delete("/{title_id}")
async def delete_project(title_id: int):
    try:
        conn = get_db()
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()

        cur.execute("DELETE FROM titles WHERE id = ?", (title_id,))
        conn.commit()

        conn.execute("VACUUM")
        conn.close()

        logger.info(f"Проект ID {title_id} полностью удалён. Выполнен VACUUM базы данных.")
        return {"success": True, "message": "Проект успешно удалён, база данных оптимизирована"}
    except Exception as e:
        logger.error(f"Ошибка при удалении проекта {title_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{title_id}/glossary")
async def get_glossary(title_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM glossary WHERE title_id = ? ORDER BY id DESC", (title_id,))
    items = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"success": True, "items": items}


@router.post("/{title_id}/glossary")
async def add_glossary_item(title_id: int, req: GlossaryItemCreate):
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

    logger.info(f"В глоссарий тайтла {title_id} добавлен термин/спикер: '{jap_word_clean}' -> '{rus_word_clean}'")
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


@router.delete("/{title_id}/glossary/{entry_id}")
async def delete_glossary_item(title_id: int, entry_id: int):
    with db_session() as cur:
        cur.execute("DELETE FROM glossary WHERE id = ? AND title_id = ?", (entry_id, title_id))
    return {"success": True}


@router.get("/{title_id}/stats")
async def get_project_stats(title_id: int):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM chapters WHERE title_id = ?", (title_id,))
    total_chapters = cur.fetchone()[0]

    cur.execute(
        """
        SELECT p.status, COUNT(*) 
        FROM pages p
        JOIN chapters c ON c.id = p.chapter_id
        WHERE c.title_id = ?
        GROUP BY p.status
        """,
        (title_id,)
    )
    status_counts = dict(cur.fetchall())
    total_pages = sum(status_counts.values())

    cur.execute(
        """
        SELECT COUNT(*), SUM(CASE WHEN tb.status = 'translated' THEN 1 ELSE 0 END)
        FROM text_blocks tb
        JOIN pages p ON p.id = tb.page_id
        JOIN chapters c ON c.id = p.chapter_id
        WHERE c.title_id = ?
        """,
        (title_id,)
    )
    row = cur.fetchone()
    total_blocks = row[0] or 0
    translated_blocks = row[1] or 0

    cur.execute("SELECT COUNT(*) FROM glossary WHERE title_id = ?", (title_id,))
    total_glossary = cur.fetchone()[0]

    conn.close()

    return {
        "success": True,
        "stats": {
            "total_chapters": total_chapters,
            "total_pages": total_pages,
            "pages_raw": status_counts.get("raw", 0) + status_counts.get("new", 0),
            "pages_detected": status_counts.get("detected", 0),
            "pages_cleaned": status_counts.get("cleaned", 0),
            "pages_translated": status_counts.get("translated", 0),
            "pages_done": status_counts.get("done", 0),
            "total_blocks": total_blocks,
            "translated_blocks": translated_blocks,
            "total_glossary": total_glossary,
        }
    }
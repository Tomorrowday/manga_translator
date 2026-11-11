# routers/projects_impl.py
# Реализация бизнес-логики управления проектами, сканирования папок, глоссария и детальной статистики (без N+1 запросов)

import os
import time
import sqlite3
from pathlib import Path
from typing import Optional, Tuple, Set, Dict, List, Any
from fastapi import HTTPException

from database import db_session, get_db
from schemas import (
    ScanProjectRequest,
    AddChapterRequest,
    GlossaryItemCreate,
    UpdateTitleSettingsRequest,
)
from config import natural_sort_key, get_available_detectors, get_available_cleaners
from ml.models import ml
from logger import logger

VALID_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".avif"}
EXCLUDED_DIR_NAMES = {
    "clean", "cleaned", "translated", "export", "exports",
    "raw", ".git", ".idea", "__pycache__", "logs"
}


def _ensure_global_settings_columns(cur: sqlite3.Cursor):
    """Гарантирует существование всех требуемых колонок в таблице global_settings."""
    cur.execute("PRAGMA table_info(global_settings)")
    cols = {row[1] for row in cur.fetchall()}
    if "show_sfx" not in cols:
        try:
            cur.execute("ALTER TABLE global_settings ADD COLUMN show_sfx INTEGER DEFAULT 0")
        except Exception as e:
            logger.debug(f"Колонка show_sfx уже существует или ошибка добавления: {e}")


def get_global_settings_endpoint():
    """Получить глобальные настройки приложения."""
    with get_db() as conn:
        cursor = conn.cursor()
        _ensure_global_settings_columns(cursor)
        cursor.execute("SELECT * FROM global_settings WHERE id = 1")
        row = cursor.fetchone()

    settings = dict(row) if row else {
        "detector_model": "yolo_manga.pt",
        "clean_model": "anime-manga-big-lama.pt",
        "detect_conf": 0.25,
        "auto_oval_bubble": 1,
        "default_padding": "safe",
        "default_hyphenation": 1,
        "font_bubble": "v_CCFaceFront",
        "font_thought": "v_CCFaceFront",
        "font_sfx": "v_Mighty Zeo 2.0",
        "lama_downscale": 0,
        "show_sfx": 0,
    }

    settings["auto_oval_bubble"] = bool(settings.get("auto_oval_bubble", 1))
    settings["default_hyphenation"] = bool(settings.get("default_hyphenation", 1))
    settings["lama_downscale"] = bool(settings.get("lama_downscale", 0))
    settings["show_sfx"] = bool(row["show_sfx"]) if (row and "show_sfx" in row.keys()) else False
    settings["available_detectors"] = get_available_detectors()
    settings["available_cleaners"] = get_available_cleaners()

    if hasattr(ml, "lama_downscale"):
        ml.lama_downscale = settings["lama_downscale"]

    return {"success": True, "settings": settings}


def update_global_settings_endpoint(req: UpdateTitleSettingsRequest):
    """Обновить глобальные настройки приложения."""
    detector = req.detector_model.strip() if req.detector_model else "yolo_manga.pt"
    cleaner = req.clean_model.strip() if req.clean_model else "anime-manga-big-lama.pt"
    if cleaner == "simple_lama":
        cleaner = "anime-manga-big-lama.pt"
    conf = float(req.detect_conf) if req.detect_conf is not None else 0.25
    auto_oval = 1 if req.auto_oval_bubble else 0
    padding = req.default_padding if req.default_padding in ["safe", "fit"] else "safe"
    hyph = 1 if req.default_hyphenation else 0
    font_b = req.font_bubble or "v_CCFaceFront"
    font_t = req.font_thought or "v_CCFaceFront"
    font_s = req.font_sfx or "v_Mighty Zeo 2.0"
    downscale = 1 if req.lama_downscale else 0
    show_sfx_val = getattr(req, "show_sfx", None)

    with db_session() as cur:
        _ensure_global_settings_columns(cur)
        cur.execute(
            """
            INSERT INTO global_settings (
                id, detector_model, clean_model, detect_conf,
                auto_oval_bubble, default_padding, default_hyphenation,
                font_bubble, font_thought, font_sfx, lama_downscale
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                detector_model = excluded.detector_model,
                clean_model = excluded.clean_model,
                detect_conf = excluded.detect_conf,
                auto_oval_bubble = excluded.auto_oval_bubble,
                default_padding = excluded.default_padding,
                default_hyphenation = excluded.default_hyphenation,
                font_bubble = excluded.font_bubble,
                font_thought = excluded.font_thought,
                font_sfx = excluded.font_sfx,
                lama_downscale = excluded.lama_downscale
            """,
            (detector, cleaner, conf, auto_oval, padding, hyph, font_b, font_t, font_s, downscale)
        )

        if show_sfx_val is not None:
            cur.execute("UPDATE global_settings SET show_sfx = ? WHERE id = 1", (1 if show_sfx_val else 0,))

        cur.execute("SELECT show_sfx FROM global_settings WHERE id = 1")
        row_sfx = cur.fetchone()
        actual_show_sfx = bool(row_sfx["show_sfx"]) if (row_sfx and "show_sfx" in row_sfx.keys()) else False

    if hasattr(ml, "lama_downscale"):
        ml.lama_downscale = bool(downscale)

    logger.info(f"Глобальные настройки обновлены: сжатие={bool(downscale)}, show_sfx={actual_show_sfx}.")
    return {
        "success": True,
        "settings": {
            "detector_model": detector,
            "clean_model": cleaner,
            "detect_conf": conf,
            "auto_oval_bubble": bool(auto_oval),
            "default_padding": padding,
            "default_hyphenation": bool(hyph),
            "font_bubble": font_b,
            "font_thought": font_t,
            "font_sfx": font_s,
            "lama_downscale": bool(downscale),
            "show_sfx": actual_show_sfx,
        }
    }


def _scan_and_insert_chapters(
    cur: sqlite3.Cursor,
    title_id: int,
    root_folder: Path,
    skip_existing: bool = False,
    existing_folders: Optional[Set[str]] = None,
    existing_names: Optional[Set[str]] = None,
    custom_chapter_name: Optional[str] = None
) -> Tuple[int, int, int]:
    added_chapters = 0
    added_pages = 0
    skipped_chapters = 0

    existing_folders = existing_folders or set()
    existing_names = existing_names or set()

    direct_files = [f for f in os.listdir(root_folder) if (root_folder / f).is_file()]
    direct_images = [f for f in direct_files if Path(f).suffix.lower() in VALID_IMAGE_EXTENSIONS]

    if direct_images:
        norm_root = os.path.normpath(str(root_folder)).lower()
        ch_name = (
            custom_chapter_name.strip()
            if custom_chapter_name and custom_chapter_name.strip()
            else root_folder.name
        )

        if skip_existing and (norm_root in existing_folders or ch_name.lower() in existing_names):
            return 0, 0, 1

        direct_images.sort(key=natural_sort_key)
        cur.execute(
            "INSERT INTO chapters (title_id, chapter_number, folder_path) VALUES (?, ?, ?)",
            (title_id, ch_name, str(root_folder))
        )
        chapter_id = cur.lastrowid
        added_chapters += 1

        for i, img in enumerate(direct_images):
            cur.execute(
                "INSERT INTO pages (chapter_id, page_number, file_path) VALUES (?, ?, ?)",
                (chapter_id, i + 1, str(root_folder / img))
            )
            added_pages += 1

        return added_chapters, added_pages, skipped_chapters

    walk_dirs = []
    for root, dirs, files in os.walk(root_folder):
        dirs[:] = [d for d in dirs if d.lower() not in EXCLUDED_DIR_NAMES]
        walk_dirs.append((root, dirs, files))

    walk_dirs.sort(key=lambda item: natural_sort_key(item[0]))

    for root, _, files in walk_dirs:
        if Path(root).name.lower() in EXCLUDED_DIR_NAMES:
            continue

        images = [f for f in files if Path(f).suffix.lower() in VALID_IMAGE_EXTENSIONS]
        if not images:
            continue

        norm_root = os.path.normpath(root).lower()
        chapter_name = Path(root).name

        if skip_existing and (norm_root in existing_folders or chapter_name.strip().lower() in existing_names):
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
            cur.execute(
                "INSERT INTO pages (chapter_id, page_number, file_path) VALUES (?, ?, ?)",
                (chapter_id, i + 1, os.path.join(root, img))
            )
            added_pages += 1

    return added_chapters, added_pages, skipped_chapters


def scan_project(req: ScanProjectRequest):
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

            chapters_count, pages_count, _ = _scan_and_insert_chapters(
                cursor, title_id=title_id, root_folder=folder, skip_existing=False
            )

        logger.info(f"Отсканирован проект '{req.name}': {chapters_count} глав, {pages_count} страниц.")
        return {
            "success": True,
            "message": f"Тайтл '{req.name}' добавлен! Глав: {chapters_count}, страниц: {pages_count}"
        }
    except Exception as e:
        logger.error(f"Ошибка сканирования папки: {e}")
        return {"success": False, "error": str(e)}


def rescan_project(title_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, folder_path FROM titles WHERE id = ?", (title_id,))
        title_row = cursor.fetchone()

        if not title_row:
            raise HTTPException(status_code=404, detail="Тайтл не найден")

        folder = Path(title_row["folder_path"])
        if not folder.exists() or not folder.is_dir():
            raise HTTPException(status_code=400, detail=f"Корневая папка тайтла не найдена: {folder}")

        cursor.execute("SELECT chapter_number, folder_path FROM chapters WHERE title_id = ?", (title_id,))
        existing_rows = cursor.fetchall()

    existing_folders = {os.path.normpath(r["folder_path"]).lower() for r in existing_rows if r["folder_path"]}
    existing_names = {r["chapter_number"].strip().lower() for r in existing_rows if r["chapter_number"]}

    try:
        with db_session() as cur:
            added_chapters, added_pages, skipped_chapters = _scan_and_insert_chapters(
                cur,
                title_id=title_id,
                root_folder=folder,
                skip_existing=True,
                existing_folders=existing_folders,
                existing_names=existing_names
            )

        return {
            "success": True,
            "message": f"Скан завершён. Добавлено: {added_chapters} глав. Пропущено: {skipped_chapters}.",
            "added_chapters": added_chapters,
            "added_pages": added_pages,
            "skipped_chapters": skipped_chapters,
        }
    except Exception as e:
        logger.error(f"Ошибка рескана проекта {title_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def add_chapters_to_title(title_id: int, req: AddChapterRequest):
    folder = Path(req.folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail="Папка не найдена или путь некорректен")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM titles WHERE id = ?", (title_id,))
        title_row = cursor.fetchone()

    if not title_row:
        raise HTTPException(status_code=404, detail="Тайтл не найден")

    try:
        with db_session() as cur:
            added_chapters, added_pages, _ = _scan_and_insert_chapters(
                cur,
                title_id=title_id,
                root_folder=folder,
                skip_existing=False,
                custom_chapter_name=req.chapter_number
            )

        if added_chapters == 0:
            raise HTTPException(status_code=400, detail="В папке не найдено изображений")

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


def get_projects():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM titles ORDER BY created_at DESC")
        projects = [dict(row) for row in cursor.fetchall()]
    return {"success": True, "projects": projects}


def get_available_detectors_endpoint():
    return {"success": True, "detectors": get_available_detectors()}


def get_available_cleaners_endpoint():
    return {"success": True, "cleaners": get_available_cleaners()}


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


def get_all_detailed_stats():
    """
    Возвращает список всех проектов со структурированными главами без N+1 запросов:
    страницы, реплики, русские слова, затраченное время (с учётом активного таймера).
    """
    now = int(time.time())
    with get_db() as conn:
        cur = conn.cursor()

        cur.execute("SELECT id, name, folder_path, created_at FROM titles ORDER BY name ASC")
        titles = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT
                c.id,
                c.title_id,
                c.chapter_number,
                c.folder_path,
                c.work_seconds,
                c.timer_started_at,
                c.cached_replicas_count,
                c.cached_words_count,
                COUNT(p.id) AS pages_count
            FROM chapters c
            LEFT JOIN pages p ON p.chapter_id = c.id
            GROUP BY c.id
            """
        )
        all_chapters = [dict(r) for r in cur.fetchall()]

    chapters_by_title: Dict[int, List[Dict[str, Any]]] = {}
    for ch in all_chapters:
        chapters_by_title.setdefault(ch["title_id"], []).append(ch)

    result_titles = []

    for t in titles:
        t_id = t["id"]
        chapters = chapters_by_title.get(t_id, [])
        chapters.sort(key=lambda c: natural_sort_key(c["chapter_number"]))

        total_title_pages = 0
        total_title_replicas = 0
        total_title_words = 0
        total_title_seconds = 0

        chapters_data = []
        for ch in chapters:
            pages_count = ch.get("pages_count") or 0

            base_sec = ch.get("work_seconds") or 0
            timer_start = ch.get("timer_started_at")
            is_timer_running = timer_start is not None
            session_sec = max(0, now - int(timer_start)) if is_timer_running else 0
            total_ch_sec = base_sec + session_sec

            reps = ch.get("cached_replicas_count")
            words = ch.get("cached_words_count")

            total_title_pages += pages_count
            total_title_seconds += total_ch_sec
            if reps is not None:
                total_title_replicas += reps
            if words is not None:
                total_title_words += words

            chapters_data.append({
                "id": ch["id"],
                "chapter_number": ch["chapter_number"],
                "pages_count": pages_count,
                "replicas_count": reps,
                "words_count": words,
                "work_seconds": total_ch_sec,
                "is_timer_running": is_timer_running,
            })

        result_titles.append({
            "id": t_id,
            "name": t["name"],
            "total_pages": total_title_pages,
            "total_replicas": total_title_replicas,
            "total_words": total_title_words,
            "total_seconds": total_title_seconds,
            "chapters": chapters_data,
        })

    return {"success": True, "projects": result_titles}


def recalculate_title_stats(title_id: int):
    """Пересчитывает реплики и слова во всех главах указанного тайтла."""
    import routers.chapters_impl as ch_impl

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM chapters WHERE title_id = ?", (title_id,))
        chapter_ids = [r[0] for r in cur.fetchall()]

    total_replicas = 0
    total_words = 0

    for ch_id in chapter_ids:
        res = ch_impl.recalculate_chapter_stats(ch_id)
        total_replicas += res["replicas_count"]
        total_words += res["words_count"]

    return {
        "success": True,
        "title_id": title_id,
        "chapters_recalculated": len(chapter_ids),
        "total_replicas": total_replicas,
        "total_words": total_words,
    }
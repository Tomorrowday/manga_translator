# routers/chapters_impl.py
# Реализация бизнес-логики работы с главами манги, таймером и подсчетом слов

import os
import re
import time
from typing import Dict, Any, Optional
from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from database import db_session, get_db
import services.chapter_service as chapter_service
from logger import logger

# Регулярка для точного подсчета слов (русских/латинских с дефисами)
WORD_REGEX = re.compile(r"[А-Яа-яЁёA-Za-z0-9]+(?:-[А-Яа-яЁёA-Za-z0-9]+)?")


def count_words_in_text(text: str) -> int:
    if not text or not text.strip():
        return 0
    return len(WORD_REGEX.findall(text))


async def delete_chapter(chapter_id: int):
    with db_session() as cur:
        cur.execute("SELECT id FROM chapters WHERE id = ?", (chapter_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Глава не найдена")
        cur.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))
    logger.info(f"Глава {chapter_id} успешно удалена из базы.")
    return {"success": True, "message": "Глава успешно удалена"}


async def reset_chapter_fonts(chapter_id: int):
    try:
        updated_count = chapter_service.apply_font_size_to_chapter_service(chapter_id, None)
        return {"success": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Ошибка сброса шрифтов главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def apply_chapter_font_size(chapter_id: int, font_size: int):
    try:
        updated_count = chapter_service.apply_font_size_to_chapter_service(chapter_id, font_size)
        return {"success": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Ошибка установки кегля для главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def export_chapter_dialogue(chapter_id: int) -> Response:
    try:
        _, dialogues_json_str, _, dialogues_filename, _ = chapter_service.build_chapter_export_payloads(chapter_id)
        return Response(
            content=dialogues_json_str,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{dialogues_filename}"'}
        )
    except Exception as e:
        logger.error(f"Ошибка экспорта диалогов главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def export_chapter_dialogue_to_folder_endpoint(chapter_id: int):
    try:
        return chapter_service.export_chapter_dialogue_to_folder(chapter_id)
    except Exception as e:
        logger.error(f"Ошибка экспорта диалогов в папку главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def import_chapter_dialogue(chapter_id: int, file: UploadFile):
    try:
        file_bytes = await file.read()
        res = chapter_service.import_chapter_dialogue_payload(chapter_id, file_bytes)
        return {
            "success": True,
            "message": f"Импортировано: обновлено {res['updated_count']} реплик из {res['total_records']} в файле.",
            **res
        }
    except Exception as e:
        logger.error(f"Ошибка импорта диалогов главы {chapter_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


async def pick_and_import_dialogue_endpoint(chapter_id: int):
    try:
        folder_path = chapter_service.get_chapter_folder_path(chapter_id)
        if not folder_path or not os.path.exists(folder_path):
            raise HTTPException(status_code=400, detail="Папка главы не найдена")

        target_file = chapter_service.find_latest_dialogue_json_in_folder(chapter_id)
        if not target_file:
            raise HTTPException(status_code=404, detail="В папке главы не найден файл с переводом (*_dialogues.json)")

        with open(target_file, "rb") as f:
            file_bytes = f.read()

        res = chapter_service.import_chapter_dialogue_payload(chapter_id, file_bytes)
        return {
            "success": True,
            "file_used": os.path.basename(target_file),
            "message": f"Успешно импортирован '{os.path.basename(target_file)}': обновлено {res['updated_count']} реплик.",
            **res
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка автоматического импорта главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def import_dialogue_from_folder_endpoint(chapter_id: int):
    return await pick_and_import_dialogue_endpoint(chapter_id)


# ---- Таймер и пересчет статистики главы ----

async def get_chapter_timer_status(chapter_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, chapter_number, work_seconds, timer_started_at FROM chapters WHERE id = ?",
        (chapter_id,)
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Глава не найдена")

    work_seconds = row["work_seconds"] or 0
    timer_started_at = row["timer_started_at"]
    is_running = timer_started_at is not None

    current_session = 0
    if is_running:
        current_session = max(0, int(time.time()) - int(timer_started_at))

    total_seconds = work_seconds + current_session

    return {
        "success": True,
        "chapter_id": chapter_id,
        "is_running": is_running,
        "work_seconds": work_seconds,
        "current_session_seconds": current_session,
        "total_seconds": total_seconds,
    }


async def start_chapter_timer(chapter_id: int):
    now = int(time.time())
    with db_session() as cur:
        cur.execute("SELECT id, timer_started_at, work_seconds FROM chapters WHERE id = ?", (chapter_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Глава не найдена")

        if row["timer_started_at"] is None:
            cur.execute("UPDATE chapters SET timer_started_at = ? WHERE id = ?", (now, chapter_id))

    return await get_chapter_timer_status(chapter_id)


async def stop_chapter_timer(chapter_id: int):
    now = int(time.time())
    with db_session() as cur:
        cur.execute("SELECT id, timer_started_at, work_seconds FROM chapters WHERE id = ?", (chapter_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Глава не найдена")

        started_at = row["timer_started_at"]
        work_sec = row["work_seconds"] or 0

        if started_at is not None:
            delta = max(0, now - int(started_at))
            new_work_seconds = work_sec + delta
            cur.execute(
                "UPDATE chapters SET work_seconds = ?, timer_started_at = NULL WHERE id = ?",
                (new_work_seconds, chapter_id)
            )

    return await get_chapter_timer_status(chapter_id)


async def recalculate_chapter_stats(chapter_id: int):
    """Выполняет пересчёт всех переведённых реплик и русских слов главы."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT tb.rus_text
        FROM text_blocks tb
        JOIN pages p ON p.id = tb.page_id
        WHERE p.chapter_id = ?
        """,
        (chapter_id,)
    )
    rows = cur.fetchall()
    conn.close()

    replicas_count = 0
    words_count = 0

    for r in rows:
        text = (r["rus_text"] or "").strip()
        if text:
            replicas_count += 1
            words_count += count_words_in_text(text)

    with db_session() as cur:
        cur.execute(
            """
            UPDATE chapters
            SET cached_replicas_count = ?, cached_words_count = ?
            WHERE id = ?
            """,
            (replicas_count, words_count, chapter_id)
        )

    return {
        "success": True,
        "chapter_id": chapter_id,
        "replicas_count": replicas_count,
        "words_count": words_count,
    }
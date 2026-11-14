import time
from fastapi import HTTPException
from database import db_session, get_db


def get_chapter_timer_status(chapter_id: int):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, chapter_number, work_seconds, timer_started_at FROM chapters WHERE id = ?",
            (chapter_id,)
        )
        row = cur.fetchone()

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


def start_chapter_timer(chapter_id: int):
    now = int(time.time())
    with db_session() as cur:
        cur.execute("SELECT id, timer_started_at, work_seconds FROM chapters WHERE id = ?", (chapter_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Глава не найдена")

        if row["timer_started_at"] is None:
            cur.execute("UPDATE chapters SET timer_started_at = ? WHERE id = ?", (now, chapter_id))

    return get_chapter_timer_status(chapter_id)


def stop_chapter_timer(chapter_id: int):
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

    return get_chapter_timer_status(chapter_id)

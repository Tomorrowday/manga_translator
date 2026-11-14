import time
from typing import Dict, List, Any
from database import get_db
from config import natural_sort_key


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

import re
from database import db_session, get_db

# Регулярка для точного подсчета слов (русских/латинских с дефисами)
WORD_REGEX = re.compile(r"[А-Яа-яЁёA-Za-z0-9]+(?:-[А-Яа-яЁёA-Za-z0-9]+)?")


def count_words_in_text(text: str) -> int:
    if not text or not text.strip():
        return 0
    return len(WORD_REGEX.findall(text))


def recalculate_chapter_stats(chapter_id: int):
    """Выполняет пересчёт всех переведённых реплик и русских слов главы."""
    with get_db() as conn:
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

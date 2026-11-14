from database import get_db


def get_page_speakers(page_id: int):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.id as chapter_id, c.title_id 
            FROM pages p 
            JOIN chapters c ON c.id = p.chapter_id 
            WHERE p.id = ?
            """,
            (page_id,)
        )
        row = cur.fetchone()
        if not row:
            return {"success": False, "speakers": []}

        title_id = row["title_id"]
        cur.execute("SELECT rus_word FROM glossary WHERE title_id = ?", (title_id,))
        glossary_names = [r["rus_word"].strip() for r in cur.fetchall() if r["rus_word"] and r["rus_word"].strip()]

        cur.execute(
            """
            SELECT DISTINCT tb.speaker 
            FROM text_blocks tb
            JOIN pages p ON p.id = tb.page_id
            JOIN chapters c ON c.id = p.chapter_id
            WHERE c.title_id = ? AND tb.speaker != ''
            """,
            (title_id,)
        )
        used_names = [r["speaker"].strip() for r in cur.fetchall() if r["speaker"] and r["speaker"].strip()]

    combined = []
    seen = set()
    for name in glossary_names + used_names:
        if name and name.lower() not in seen:
            seen.add(name.lower())
            combined.append(name)

    return {"success": True, "speakers": sorted(combined)}

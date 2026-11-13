import re
import urllib.request
import json
from typing import Dict, Any, List
from fastapi import HTTPException

from database import db_session, get_db
from ml.models import ml
from services.translator import translate_chapter_dialogues, sanitize_translation
from logger import logger

CLASS_TYPE_LABELS = {
    0: "bubble",
    1: "thought",
    2: "text",
    3: "sfx",
}


def _translate_chapter_via_ollama(
    dialogue_items: List[Dict[str, Any]],
    title_description: str = "",
    glossary_rows: List[Dict[str, Any]] = None,
) -> Dict[str, str]:
    """Локальный перевод главы через Ollama, если Gemini не настроен."""
    base_url = "http://localhost:11434"
    req_tags = urllib.request.Request(f"{base_url}/api/tags", method="GET")
    with urllib.request.urlopen(req_tags, timeout=2.5) as resp:
        tags_data = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name", "") for m in tags_data.get("models", [])]

    if not models:
        raise RuntimeError("В локальной Ollama не найдено загруженных моделей.")

    chosen_model = next((m for m in models if "qwen" in m.lower() or "llama" in m.lower()), models[0])

    lines = []
    for idx, it in enumerate(dialogue_items):
        b_type = CLASS_TYPE_LABELS.get(int(it.get("class_id") or 0), "bubble")
        spk = f"[{it['speaker']}] " if it.get("speaker") else ""
        lines.append(f"[{idx + 1}] ({b_type}) {spk}{it['text']}")

    glossary_text = ""
    if glossary_rows:
        g_lines = [f"- {g.get('jap_word') or ''} -> {g.get('rus_word')} ({g.get('context') or ''})" for g in glossary_rows]
        glossary_text = "\nГлоссарий:\n" + "\n".join(g_lines) + "\n"

    synopsis_text = f"\nСинопсис:\n{title_description}\n" if title_description else ""

    prompt = (
        "Ты профессиональный литературный переводчик манги с японского на русский язык.\n"
        "Переведи реплики главы по порядку. В скобках указан тип блока: "
        "(bubble) — живая речь в бабле, (thought) — мысли/нарратив, (text) — надпись на фоне, (sfx) — звук.\n"
        f"{synopsis_text}{glossary_text}\n"
        "КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать в ответе тип блока, имена спикеров или пояснения!\n"
        "Формат ответа СТРОГО:\n"
        "[1] Русский перевод первой реплики\n"
        "[2] Русский перевод второй реплики\n\n"
        "Оригинал:\n" + "\n".join(lines)
    )

    payload = json.dumps({
        "model": chosen_model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.3},
    }).encode("utf-8")

    req_gen = urllib.request.Request(
        f"{base_url}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req_gen, timeout=180.0) as resp:
        gen_data = json.loads(resp.read().decode("utf-8"))

    raw_response = gen_data.get("response", "")
    result_map: Dict[str, str] = {}
    for line in raw_response.split("\n"):
        match = re.match(r"^\[(\d+)\]\s*(.*)$", line.strip())
        if match:
            idx = int(match.group(1)) - 1
            if 0 <= idx < len(dialogue_items):
                result_map[dialogue_items[idx]["id"]] = sanitize_translation(match.group(2))

    return result_map


def translate_chapter_endpoint(chapter_id: int):
    """Переводит все реплики главы через Gemini или локальную Ollama."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.id, c.title_id, t.description, g.auto_oval_bubble
            FROM chapters c
            JOIN titles t ON t.id = c.title_id
            LEFT JOIN global_settings g ON g.id = 1
            WHERE c.id = ?
            """,
            (chapter_id,)
        )
        ch_row = cur.fetchone()
        if not ch_row:
            raise HTTPException(status_code=404, detail="Глава не найдена")

        title_id = ch_row["title_id"]
        title_desc = ch_row["description"] or ""
        auto_oval = bool(ch_row["auto_oval_bubble"]) if ch_row["auto_oval_bubble"] is not None else True

        cur.execute("SELECT jap_word, rus_word, context FROM glossary WHERE title_id = ?", (title_id,))
        glossary_rows = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT tb.id, tb.jap_text, tb.speaker, tb.class_id, tb.shape, p.page_number
            FROM text_blocks tb
            JOIN pages p ON p.id = tb.page_id
            WHERE p.chapter_id = ? AND TRIM(tb.jap_text) != ''
            ORDER BY p.page_number ASC, tb.order_index ASC
            """,
            (chapter_id,)
        )
        blocks = [dict(r) for r in cur.fetchall()]

    if not blocks:
        return {"success": True, "updated_count": 0, "message": "Нет распознанных японских реплик для перевода."}

    chapter_dialogue = [
        {
            "id": b["id"],
            "page": b["page_number"],
            "speaker": b["speaker"] or "",
            "text": b["jap_text"],
            "class_id": b.get("class_id", 0),
            "type": CLASS_TYPE_LABELS.get(int(b.get("class_id") or 0), "bubble"),
        }
        for b in blocks
    ]

    try:
        if ml.gemini_model:
            translations = translate_chapter_dialogues(chapter_dialogue, glossary_rows, title_desc)
        else:
            translations = _translate_chapter_via_ollama(chapter_dialogue, title_desc, glossary_rows)
    except Exception as e:
        logger.error(f"Ошибка при пакетном переводе главы {chapter_id}: {e}")
        raise HTTPException(
            status_code=400,
            detail=(
                f"Не удалось выполнить автоматический перевод главы ({e}). "
                "Запустите локальную Ollama или используйте Export JSON / Import JSON."
            ),
        )

    updated_count = 0
    with db_session() as cur:
        for b in blocks:
            b_id = b["id"]
            trans_text = translations.get(b_id, "").strip()
            if not trans_text:
                continue

            new_shape = b.get("shape") or "rect"
            if int(b.get("class_id") or 0) == 0 and auto_oval:
                new_shape = "ellipse"

            cur.execute(
                """
                UPDATE text_blocks
                SET rus_text = ?, shape = ?, status = 'translated'
                WHERE id = ?
                """,
                (trans_text, new_shape, b_id)
            )
            updated_count += 1

        cur.execute(
            """
            UPDATE pages
            SET status = 'translated'
            WHERE chapter_id = ? AND status != 'done'
            """,
            (chapter_id,)
        )

    return {
        "success": True,
        "updated_count": updated_count,
        "message": f"Переведено {updated_count} из {len(blocks)} реплик главы.",
    }

# routers/chapters_impl.py
# Реализация бизнес-логики работы с главами манги, переводом главы, таймером и подсчетом слов

import os
import re
import time
import urllib.request
import json
from typing import Dict, Any, List
from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from database import db_session, get_db
from ml.models import ml
import services.chapter_service as chapter_service
from services.translator import translate_chapter_dialogues, sanitize_translation
from logger import logger

# Регулярка для точного подсчета слов (русских/латинских с дефисами)
WORD_REGEX = re.compile(r"[А-Яа-яЁёA-Za-z0-9]+(?:-[А-Яа-яЁёA-Za-z0-9]+)?")

CLASS_TYPE_LABELS = {
    0: "bubble",
    1: "thought",
    2: "text",
    3: "sfx",
}


def count_words_in_text(text: str) -> int:
    if not text or not text.strip():
        return 0
    return len(WORD_REGEX.findall(text))


def delete_chapter(chapter_id: int):
    with db_session() as cur:
        cur.execute("SELECT id FROM chapters WHERE id = ?", (chapter_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Глава не найдена")
        cur.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))
    logger.info(f"Глава {chapter_id} успешно удалена из базы.")
    return {"success": True, "message": "Глава успешно удалена"}


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


def reset_chapter_fonts(chapter_id: int):
    try:
        updated_count = chapter_service.apply_font_size_to_chapter_service(chapter_id, None)
        return {"success": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Ошибка сброса шрифтов главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def apply_chapter_font_size(chapter_id: int, font_size: int):
    try:
        updated_count = chapter_service.apply_font_size_to_chapter_service(chapter_id, font_size)
        return {"success": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Ошибка установки кегля для главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def export_chapter_dialogue(chapter_id: int) -> Response:
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


def export_chapter_dialogue_to_folder_endpoint(chapter_id: int):
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


def pick_and_import_dialogue_endpoint(chapter_id: int):
    """
    Пытается автоматически найти и импортировать *_dialogues.json из папки главы.
    Если файл не найден, возвращает {"success": False, "auto_found": False, "cancelled": False},
    чтобы фронтенд открыл стандартное окно выбора файла без HTTP-ошибки 404.
    """
    try:
        folder_path = chapter_service.get_chapter_folder_path(chapter_id)
        if not folder_path or not os.path.exists(folder_path):
            return {"success": False, "auto_found": False, "cancelled": False}

        target_file = chapter_service.find_latest_dialogue_json_in_folder(chapter_id)
        if not target_file or not os.path.exists(target_file):
            return {"success": False, "auto_found": False, "cancelled": False}

        with open(target_file, "rb") as f:
            file_bytes = f.read()

        res = chapter_service.import_chapter_dialogue_payload(chapter_id, file_bytes)
        return {
            "success": True,
            "auto_found": True,
            "cancelled": False,
            "file_path": target_file,
            "file_used": os.path.basename(target_file),
            "message": f"Успешно импортирован '{os.path.basename(target_file)}': обновлено {res['updated_count']} реплик.",
            **res
        }
    except Exception as e:
        logger.error(f"Ошибка автоматического импорта главы {chapter_id}: {e}")
        return {"success": False, "auto_found": False, "cancelled": False, "error": str(e)}


def import_dialogue_from_folder_endpoint(chapter_id: int):
    return pick_and_import_dialogue_endpoint(chapter_id)


# ---- Таймер и пересчет статистики главы ----

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
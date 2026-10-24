# services/chapter_service_impl.py
# Бизнес-логика работы с главами: экспорт в 2 раздельных JSON и чистый импорт

import os
import json
import re
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List

from database import get_db, db_session
from services.prompts import CLAUDE_CHATGPT_EXPORT_INSTRUCTIONS
from logger import logger


def build_chapter_export_payloads(chapter_id: int) -> Tuple[str, str, str, str, Optional[str]]:
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT c.chapter_number, c.folder_path as chapter_folder, t.id as title_id, t.name as title_name, t.description as title_description
        FROM chapters c
        JOIN titles t ON t.id = c.title_id
        WHERE c.id = ?
        """,
        (chapter_id,)
    )
    ch_row = cursor.fetchone()
    if not ch_row:
        conn.close()
        raise ValueError("Глава не найдена")

    title_id = ch_row["title_id"]
    title_name = ch_row["title_name"]
    title_description = ch_row["title_description"] or ""
    chapter_num = ch_row["chapter_number"]
    chapter_folder = ch_row["chapter_folder"]

    cursor.execute("SELECT jap_word, rus_word, context FROM glossary WHERE title_id = ?", (title_id,))
    glossary_items = [
        {"jap": r["jap_word"], "rus": r["rus_word"], "context": r["context"] or ""}
        for r in cursor.fetchall()
    ]

    cursor.execute(
        """
        SELECT tb.id, tb.speaker, tb.jap_text, tb.rus_text, tb.order_index, p.page_number, p.file_path
        FROM text_blocks tb
        JOIN pages p ON p.id = tb.page_id
        WHERE p.chapter_id = ?
        ORDER BY p.page_number ASC, tb.order_index ASC
        """,
        (chapter_id,)
    )
    blocks = [dict(r) for r in cursor.fetchall()]

    if (not chapter_folder or not os.path.exists(chapter_folder)) and blocks:
        first_img = blocks[0].get("file_path")
        if first_img and os.path.exists(first_img):
            chapter_folder = os.path.dirname(first_img)

    conn.close()

    dialogues: List[Dict[str, str]] = []
    page_bubble_counters: Dict[int, int] = {}

    for b in blocks:
        p_num = b["page_number"]
        page_bubble_counters[p_num] = page_bubble_counters.get(p_num, 0) + 1
        bubble_order = b["order_index"] if (b.get("order_index") and b["order_index"] > 0) else page_bubble_counters[p_num]

        dialogues.append({
            "id": f"{p_num}-{bubble_order}",
            "speaker": b["speaker"] or "",
            "raw": b["jap_text"] or "",
            "ru": b["rus_text"] or ""
        })

    context_payload = {
        "instructions": CLAUDE_CHATGPT_EXPORT_INSTRUCTIONS,
        "synopsis": title_description,
        "glossary": glossary_items
    }

    clean_title = re.sub(r'[\\/*?:"<>|]', "", title_name).replace(" ", "_")
    clean_chap = re.sub(r'[\\/*?:"<>|]', "", str(chapter_num)).replace(" ", "_")

    context_filename = f"{clean_title}_{clean_chap}_context.json"
    dialogues_filename = f"{clean_title}_{clean_chap}_dialogues.json"

    context_json = json.dumps(context_payload, ensure_ascii=False, indent=2)
    dialogues_json = json.dumps(dialogues, ensure_ascii=False, indent=2)

    return context_json, dialogues_json, context_filename, dialogues_filename, chapter_folder


def export_chapter_dialogue_to_folder(chapter_id: int) -> Dict[str, Any]:
    (
        context_json,
        dialogues_json,
        context_filename,
        dialogues_filename,
        chapter_folder
    ) = build_chapter_export_payloads(chapter_id)

    if not chapter_folder or not os.path.exists(chapter_folder):
        raise ValueError("Папка главы на диске не найдена")

    context_path = Path(chapter_folder) / context_filename
    context_path.write_text(context_json, encoding="utf-8")

    dialogues_path = Path(chapter_folder) / dialogues_filename
    dialogues_path.write_text(dialogues_json, encoding="utf-8")

    logger.info(f"Файлы скрипта главы успешно сохранены:\n1. {context_path}\n2. {dialogues_path}")

    return {
        "success": True,
        "context_file": context_filename,
        "dialogues_file": dialogues_filename,
        "saved_path": str(dialogues_path),
        "folder": str(chapter_folder)
    }


def get_chapter_folder_path(chapter_id: int) -> Optional[str]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT folder_path FROM chapters WHERE id = ?", (chapter_id,))
    row = cur.fetchone()
    folder = row["folder_path"] if row and row["folder_path"] else None

    if not folder or not os.path.exists(folder):
        cur.execute("SELECT file_path FROM pages WHERE chapter_id = ? LIMIT 1", (chapter_id,))
        p_row = cur.fetchone()
        if p_row and p_row["file_path"] and os.path.exists(p_row["file_path"]):
            folder = os.path.dirname(p_row["file_path"])

    conn.close()
    return folder


def find_latest_dialogue_json_in_folder(chapter_id: int) -> Optional[str]:
    folder = get_chapter_folder_path(chapter_id)
    if not folder or not os.path.exists(folder):
        return None

    json_files = [f for f in Path(folder).glob("*.json") if not f.name.endswith("_context.json")]
    if not json_files:
        json_files = list(Path(folder).glob("*.json"))
    if not json_files:
        return None

    json_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return str(json_files[0])


def import_chapter_dialogue_payload(chapter_id: int, file_bytes: bytes) -> Dict[str, int]:
    text = file_bytes.decode("utf-8").strip()

    if "```" in text:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            text = match.group(1).strip()

    data = json.loads(text)

    if isinstance(data, list):
        dialogues = data
    elif isinstance(data, dict):
        dialogues = data.get("dialogues")
        if not dialogues or not isinstance(dialogues, list):
            raise ValueError("В JSON отсутствует список реплик")
    else:
        raise ValueError("Неверный формат JSON файла")

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT auto_oval_bubble FROM global_settings WHERE id = 1")
    setting_row = cur.fetchone()
    auto_oval_enabled = bool(setting_row["auto_oval_bubble"]) if setting_row else True

    cur.execute(
        """
        SELECT tb.id, tb.rus_text, tb.speaker, tb.order_index, tb.class_id, tb.shape, p.page_number
        FROM text_blocks tb
        JOIN pages p ON p.id = tb.page_id
        WHERE p.chapter_id = ?
        ORDER BY p.page_number ASC, tb.order_index ASC
        """,
        (chapter_id,)
    )
    existing_blocks = [dict(r) for r in cur.fetchall()]
    conn.close()

    by_uuid: Dict[str, dict] = {b["id"]: b for b in existing_blocks}
    by_page_order: Dict[str, dict] = {f"{b['page_number']}-{b['order_index']}": b for b in existing_blocks}

    page_blocks_list: Dict[int, list] = {}
    for b in existing_blocks:
        page_blocks_list.setdefault(b["page_number"], []).append(b)

    updated_count = 0
    updated_speakers_count = 0

    with db_session() as cur_session:
        for item in dialogues:
            key_id = str(item.get("id", "")).strip()
            ru_text = item.get("ru", "").strip()
            imported_speaker = item.get("speaker", "").strip()

            if not key_id or (not ru_text and not imported_speaker):
                continue

            target_block = None

            if "-" in key_id and not len(key_id) > 30:
                parts = key_id.split("-")
                if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                    p_num = int(parts[0])
                    b_num = int(parts[1])

                    target_block = by_page_order.get(f"{p_num}-{b_num}")
                    if not target_block and p_num in page_blocks_list:
                        p_list = page_blocks_list[p_num]
                        if 1 <= b_num <= len(p_list):
                            target_block = p_list[b_num - 1]

            if not target_block and key_id in by_uuid:
                target_block = by_uuid[key_id]

            if not target_block:
                continue

            real_block_id = target_block["id"]
            final_ru = ru_text if ru_text else target_block["rus_text"]
            final_spk = target_block["speaker"]

            if imported_speaker and (not target_block["speaker"] or target_block["speaker"] != imported_speaker):
                final_spk = imported_speaker
                updated_speakers_count += 1

            new_status = "translated" if final_ru else "ocr-done"

            new_shape = target_block.get("shape", "rect")
            if target_block.get("class_id", 0) == 0 and auto_oval_enabled:
                new_shape = "ellipse" if final_ru else "rect"

            cur_session.execute(
                "UPDATE text_blocks SET rus_text = ?, speaker = ?, shape = ?, status = ? WHERE id = ?",
                (final_ru, final_spk, new_shape, new_status, real_block_id)
            )
            updated_count += 1

        cur_session.execute(
            """
            UPDATE pages 
            SET status = 'translated' 
            WHERE chapter_id = ? AND status != 'done'
            """,
            (chapter_id,)
        )

    logger.info(
        f"Импорт главы {chapter_id}: обновлено реплик: {updated_count}, спикеров: {updated_speakers_count}"
    )

    return {"updated_count": updated_count, "updated_speakers_count": updated_speakers_count}
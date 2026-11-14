# services/chapter_service_ops/export_payloads.py
# Сборка и сохранение JSON-скриптов главы (контекст + реплики)

import os
import json
import re
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List

from database import get_db
from services.prompts import CLAUDE_CHATGPT_EXPORT_INSTRUCTIONS
from logger import logger

CLASS_ID_TO_TYPE = {
    0: "bubble",
    1: "thought",
    2: "text",
    3: "sfx",
}


def build_chapter_export_payloads(chapter_id: int) -> Tuple[str, str, str, str, Optional[str]]:
    with get_db() as conn:
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
            SELECT tb.id, tb.class_id, tb.speaker, tb.jap_text, tb.rus_text, tb.order_index, p.page_number, p.file_path
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

    dialogues: List[Dict[str, str]] = []
    page_bubble_counters: Dict[int, int] = {}

    for b in blocks:
        p_num = b["page_number"]
        page_bubble_counters[p_num] = page_bubble_counters.get(p_num, 0) + 1
        bubble_order = b["order_index"] if (b.get("order_index") and b["order_index"] > 0) else page_bubble_counters[p_num]
        cls_id = int(b.get("class_id") or 0)
        block_type = CLASS_ID_TO_TYPE.get(cls_id, "bubble")

        dialogues.append({
            "id": f"{p_num}-{bubble_order}",
            "type": block_type,
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

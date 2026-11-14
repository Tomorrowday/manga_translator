# services/chapter_service_ops/import_payloads.py
# Импорт готового JSON-перевода главы: реплики, спикеры, форма баблов и статусы

import json
import re
from typing import Dict

from database import get_db, db_session
from logger import logger


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

    with get_db() as conn:
        cur = conn.cursor()

        cur.execute("SELECT auto_oval_bubble FROM global_settings WHERE id = 1")
        setting_row = cur.fetchone()
        auto_oval_enabled = bool(setting_row["auto_oval_bubble"]) if setting_row else True

        cur.execute(
            """
            SELECT tb.id, tb.rus_text, tb.speaker, tb.order_index, tb.class_id, tb.shape, tb.font_size, p.page_number
            FROM text_blocks tb
            JOIN pages p ON p.id = tb.page_id
            WHERE p.chapter_id = ?
            ORDER BY p.page_number ASC, tb.order_index ASC
            """,
            (chapter_id,)
        )
        existing_blocks = [dict(r) for r in cur.fetchall()]

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
                """
                UPDATE text_blocks 
                SET rus_text = ?, speaker = ?, shape = ?, status = ? 
                WHERE id = ?
                """,
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

    return {
        "updated_count": updated_count,
        "updated_speakers_count": updated_speakers_count,
        "total_records": len(dialogues),
    }

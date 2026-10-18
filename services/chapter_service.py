# services/chapter_service.py
# Бизнес-логика работы с главами: массовый перевод, экспорт и импорт диалогов

import os
import json
import re
import uuid
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from PIL import Image

from database import get_db, db_session
from ml.models import ml
from services.detector import detect_and_filter_bubbles
from services.ocr import ocr_image_region
from services.translator import translate_chapter_dialogues
from services.prompts import CLAUDE_CHATGPT_EXPORT_INSTRUCTIONS
from logger import logger


def translate_entire_chapter_service(chapter_id: int) -> int:
    """Оркестрация автодетекции, OCR и пакетного перевода Gemini для всей главы."""
    if ml.gemini_model is None:
        raise RuntimeError("Gemini API не сконфигурирован")

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, page_number, file_path, status FROM pages WHERE chapter_id = ? ORDER BY page_number ASC",
        (chapter_id,)
    )
    pages = [dict(r) for r in cursor.fetchall()]

    cursor.execute(
        """
        SELECT g.jap_word, g.rus_word, g.context 
        FROM glossary g
        JOIN chapters c ON c.title_id = g.title_id
        WHERE c.id = ?
        """,
        (chapter_id,)
    )
    glossary_rows = [dict(r) for r in cursor.fetchall()]

    cursor.execute(
        """
        SELECT t.description 
        FROM chapters c
        JOIN titles t ON t.id = c.title_id
        WHERE c.id = ?
        """,
        (chapter_id,)
    )
    title_row = cursor.fetchone()
    title_description = title_row["description"] if title_row and title_row["description"] else ""
    conn.close()

    if not pages:
        raise ValueError("Страницы главы не найдены")

    chapter_dialogue = []

    for page in pages:
        page_id = page["id"]
        img_path = page["file_path"]
        page_status = page.get("status", "raw")

        with db_session() as cur:
            cur.execute(
                """
                SELECT id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index 
                FROM text_blocks 
                WHERE page_id = ? 
                ORDER BY order_index ASC
                """,
                (page_id,)
            )
            blocks = [dict(r) for r in cur.fetchall()]
            img = None

            if not blocks and os.path.exists(img_path) and page_status in ["raw", "new"]:
                img = Image.open(img_path).convert("RGB")
                detected_boxes = detect_and_filter_bubbles(img)

                for b in detected_boxes:
                    block_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO text_blocks (id, page_id, x, y, width, height, rotation, order_index, status) 
                        VALUES (?, ?, ?, ?, ?, ?, 0.0, ?, 'new')
                        """,
                        (block_id, page_id, b["x"], b["y"], b["width"], b["height"], b["order_index"])
                    )

                cur.execute(
                    """
                    SELECT id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index 
                    FROM text_blocks 
                    WHERE page_id = ? 
                    ORDER BY order_index ASC
                    """,
                    (page_id,)
                )
                blocks = [dict(r) for r in cur.fetchall()]

            for b in blocks:
                if not (b["jap_text"] or "").strip():
                    if img is None and os.path.exists(img_path):
                        img = Image.open(img_path).convert("RGB")

                    if img and ml.mocr:
                        jap_text = ocr_image_region(
                            img,
                            b["x"],
                            b["y"],
                            b["width"],
                            b["height"],
                            rotation=b.get("rotation", 0.0) or 0.0
                        )
                        b["jap_text"] = jap_text
                        cur.execute(
                            "UPDATE text_blocks SET jap_text = ?, status = 'ocr-done' WHERE id = ?",
                            (jap_text, b["id"])
                        )

                if (b["jap_text"] or "").strip():
                    chapter_dialogue.append({
                        "id": b["id"],
                        "speaker": b["speaker"],
                        "text": b["jap_text"].strip(),
                        "page": page["page_number"]
                    })

    if not chapter_dialogue:
        return 0

    translations = translate_chapter_dialogues(chapter_dialogue, glossary_rows, title_description=title_description)

    with db_session() as cur:
        for block_id, translated_text in translations.items():
            cur.execute(
                "UPDATE text_blocks SET rus_text = ?, status = 'translated' WHERE id = ?",
                (translated_text, block_id)
            )

        cur.execute(
            """
            UPDATE pages 
            SET status = 'translated' 
            WHERE chapter_id = ? AND status != 'done'
            """,
            (chapter_id,)
        )

    return len(translations)


def build_chapter_export_payload(chapter_id: int) -> Tuple[dict, str, str, Optional[str]]:
    """
    Внутренний сбор структуры JSON скрипта главы с компактным форматом 'id': '{page}-{bubble}'.
    Возвращает (payload_dict, json_content, filename, chapter_folder_path).
    """
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

    # Сжатый формат элементов диалогов: id = "{page_number}-{bubble_order}"
    dialogues = []
    # Счётчик для страниц без заданного order_index
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

    payload = {
        "instructions_for_ai": CLAUDE_CHATGPT_EXPORT_INSTRUCTIONS,
        "title": title_name,
        "description": title_description,
        "chapter": chapter_num,
        "glossary": glossary_items,
        "dialogues": dialogues
    }

    clean_title = re.sub(r'[\\/*?:"<>|]', "", title_name).replace(" ", "_")
    clean_chap = re.sub(r'[\\/*?:"<>|]', "", str(chapter_num)).replace(" ", "_")
    filename = f"{clean_title}_{clean_chap}_dialogue.json"
    json_content = json.dumps(payload, ensure_ascii=False, indent=2)

    return payload, json_content, filename, chapter_folder


def export_chapter_dialogue_payload(chapter_id: int) -> Tuple[str, str]:
    """
    Формирует JSON-скрипт главы и сохраняет дубликат в папку главы, если она доступна.
    Возвращает (json_str, filename).
    """
    _, json_content, filename, chapter_folder = build_chapter_export_payload(chapter_id)

    if chapter_folder and os.path.exists(chapter_folder):
        try:
            target_path = Path(chapter_folder) / filename
            target_path.write_text(json_content, encoding="utf-8")
            logger.info(f"JSON скрипт главы сохранён на диск: {target_path}")
        except Exception as e:
            logger.warning(f"Не удалось записать файл скрипта в папку {chapter_folder}: {e}")

    return json_content, filename


def export_chapter_dialogue_to_folder(chapter_id: int) -> Dict[str, Any]:
    """
    Явный экспорт JSON-скрипта главы в локальную папку этой главы на диске.
    """
    _, json_content, filename, chapter_folder = build_chapter_export_payload(chapter_id)

    if not chapter_folder or not os.path.exists(chapter_folder):
        raise ValueError("Папка главы на диске не найдена")

    target_path = Path(chapter_folder) / filename
    target_path.write_text(json_content, encoding="utf-8")
    logger.info(f"JSON скрипт главы успешно сохранён в папку главы: {target_path}")

    return {
        "success": True,
        "filename": filename,
        "saved_path": str(target_path),
        "folder": str(chapter_folder)
    }


def get_chapter_folder_path(chapter_id: int) -> Optional[str]:
    """Возвращает путь к папке главы на диске."""
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
    """Находит самый свежий JSON файл скрипта диалогов в папке главы."""
    folder = get_chapter_folder_path(chapter_id)
    if not folder or not os.path.exists(folder):
        return None

    json_files = list(Path(folder).glob("*.json"))
    if not json_files:
        return None

    json_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return str(json_files[0])


def import_chapter_dialogue_payload(chapter_id: int, file_bytes: bytes) -> Dict[str, int]:
    """
    Парсит JSON файл скрипта, сопоставляя как новый формат '12-3',
    так и старый формат сырого UUID. Сохраняет переводы и спикеров.
    """
    text = file_bytes.decode("utf-8").strip()

    if "```" in text:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            text = match.group(1).strip()

    data = json.loads(text)
    dialogues = data.get("dialogues")
    if not dialogues or not isinstance(dialogues, list):
        raise ValueError("В JSON отсутствует список 'dialogues'")

    # Загружаем существующие блоки главы для сопоставления
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT tb.id, tb.rus_text, tb.speaker, tb.order_index, p.page_number
        FROM text_blocks tb
        JOIN pages p ON p.id = tb.page_id
        WHERE p.chapter_id = ?
        ORDER BY p.page_number ASC, tb.order_index ASC
        """,
        (chapter_id,)
    )
    existing_blocks = [dict(r) for r in cur.fetchall()]
    conn.close()

    # Быстрые словари поиска:
    # 1. По UUID (для старых файлов)
    by_uuid: Dict[str, dict] = {b["id"]: b for b in existing_blocks}
    # 2. По ключу "Page-Order" (для нового формата "12-3")
    by_page_order: Dict[str, dict] = {f"{b['page_number']}-{b['order_index']}": b for b in existing_blocks}

    # Вспомогательный индекс по порядковому номеру на странице (если order_index был 0)
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

            # 1. Попытка сопоставить по новому формату "Page-Bubble" (например: "12-3")
            if "-" in key_id and not len(key_id) > 30:
                parts = key_id.split("-")
                if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                    p_num = int(parts[0])
                    b_num = int(parts[1])

                    target_block = by_page_order.get(f"{p_num}-{b_num}")
                    if not target_block and p_num in page_blocks_list:
                        # Fallback на индекс в массиве страницы (1-based)
                        p_list = page_blocks_list[p_num]
                        if 1 <= b_num <= len(p_list):
                            target_block = p_list[b_num - 1]

            # 2. Попытка сопоставить по прямому UUID (обратная совместимость)
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

            cur_session.execute(
                "UPDATE text_blocks SET rus_text = ?, speaker = ?, status = ? WHERE id = ?",
                (final_ru, final_spk, new_status, real_block_id)
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
        f"Импорт главы {chapter_id}: обновлено реплик: {updated_count}, "
        f"спикеров: {updated_speakers_count}"
    )

    return {"updated_count": updated_count, "updated_speakers_count": updated_speakers_count}
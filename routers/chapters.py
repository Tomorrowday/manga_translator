import os
import json
import re
import uuid
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from PIL import Image

from database import get_db, db_session
from ml.models import ml
from services.detector import detect_and_filter_bubbles
from services.ocr import ocr_image_region
from services.translator import translate_chapter_dialogues
from logger import logger

router = APIRouter(prefix="/api/chapters", tags=["Chapters"])


@router.delete("/{chapter_id}")
async def delete_chapter(chapter_id: int):
    """
    Удаляет отдельную главу и все её страницы/баблы из базы данных.
    Файлы на диске остаются нетронутыми.
    """
    try:
        conn = get_db()
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()
        cur.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))
        conn.commit()
        conn.close()

        logger.info(f"Глава ID {chapter_id} успешно удалена из базы данных.")
        return {"success": True, "message": "Глава успешно удалена"}
    except Exception as e:
        logger.error(f"Ошибка при удалении главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/translate-all")
async def translate_entire_chapter(chapter_id: int):
    """
    Черновой автоматический перевод главы через встроенную модель Gemini.
    """
    if ml.gemini_model is None:
        raise HTTPException(status_code=500, detail="Gemini API не сконфигурирован")

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, page_number, file_path FROM pages WHERE chapter_id = ? ORDER BY page_number ASC",
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
        raise HTTPException(status_code=404, detail="Страницы главы не найдены")

    chapter_dialogue = []

    for page in pages:
        page_id = page["id"]
        img_path = page["file_path"]

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

            if not blocks and os.path.exists(img_path):
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
        return {"success": True, "message": "Нет текста для перевода", "translated_blocks": 0}

    try:
        translations = translate_chapter_dialogues(chapter_dialogue, glossary_rows, title_description=title_description)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка перевода главы: {e}")

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
            WHERE chapter_id = ? AND status NOT IN ('done', 'cleaned')
            """,
            (chapter_id,)
        )

    return {"success": True, "translated_blocks": len(translations)}


@router.get("/{chapter_id}/export-dialogue")
async def export_chapter_dialogue(chapter_id: int):
    """
    Экспорт скрипта главы в структурированный JSON с готовым промптом для Claude / ChatGPT.
    В промпт заложена инструкция по распознаванию говорящего ('speaker') по тексту и глоссарию.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT c.chapter_number, t.id as title_id, t.name as title_name, t.description as title_description
        FROM chapters c
        JOIN titles t ON t.id = c.title_id
        WHERE c.id = ?
        """,
        (chapter_id,)
    )
    ch_row = cursor.fetchone()
    if not ch_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Глава не найдена")

    title_id = ch_row["title_id"]
    title_name = ch_row["title_name"]
    title_description = ch_row["title_description"] or ""
    chapter_num = ch_row["chapter_number"]

    cursor.execute("SELECT jap_word, rus_word, context FROM glossary WHERE title_id = ?", (title_id,))
    glossary_items = [
        {"jap": r["jap_word"], "rus": r["rus_word"], "context": r["context"] or ""}
        for r in cursor.fetchall()
    ]

    cursor.execute(
        """
        SELECT tb.id, tb.speaker, tb.jap_text, tb.rus_text, tb.order_index, p.page_number
        FROM text_blocks tb
        JOIN pages p ON p.id = tb.page_id
        WHERE p.chapter_id = ?
        ORDER BY p.page_number ASC, tb.order_index ASC
        """,
        (chapter_id,)
    )
    blocks = [dict(r) for r in cursor.fetchall()]
    conn.close()

    dialogues = []
    for idx, b in enumerate(blocks):
        dialogues.append({
            "id": b["id"],
            "page": b["page_number"],
            "bubble": b["order_index"] or (idx + 1),
            "speaker": b["speaker"] or "",
            "raw": b["jap_text"] or "",
            "ru": b["rus_text"] or ""
        })

    prompt_instructions = (
        "Ты ведущий литературный переводчик и редактор манги.\n"
        "Перед тобой реплики главы манги в строгом порядке чтения (страница за страницей, справа налево).\n\n"
        "ТВОИ ЗАДАЧИ:\n"
        "1. ПЕРЕВОД (поле 'ru'): Переведи текст из поля 'raw' (японский) на живой, выразительный русский язык. "
        "Учитывай синопсис тайтла, характеры героев и контекст сцен.\n"
        "2. РАСПОЗНАВАНИЕ СПИКЕРА (поле 'speaker'):\n"
        "   - Если поле 'speaker' уже заполнено — сохрани его и строго соблюдай характер этого персонажа.\n"
        "   - Если поле 'speaker' ПУСТОЕ — определи говорящего персонажа на основе контекста диалога, "
        "местоимений (ore, boku, watashi, atashi), характерных частиц (ze, wa, ssu), а также списка из полей 'glossary' и 'description'.\n"
        "   - Если реплику произносит безымянный второстепенный герой — укажи его роль (например: 'Толпа', 'Официант', 'Полицейский', 'Мысли', 'Голос за кадром').\n"
        "3. ФОРМАТ: Верни JSON в точно такой же структуре. Значения 'id', 'page' и 'bubble' не изменяй."
    )

    payload = {
        "instructions_for_ai": prompt_instructions,
        "title": title_name,
        "description": title_description,
        "chapter": chapter_num,
        "glossary": glossary_items,
        "dialogues": dialogues
    }

    json_content = json.dumps(payload, ensure_ascii=False, indent=2)

    filename = f"{title_name}_chapter_{chapter_num}_dialogue.json"
    encoded_filename = quote(filename)

    logger.info(f"Экспортирован JSON-скрипт с промптом для главы {chapter_num} (всего фраз: {len(dialogues)})")

    return Response(
        content=json_content,
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}"
        }
    )


@router.post("/{chapter_id}/import-dialogue")
async def import_chapter_dialogue(chapter_id: int, file: UploadFile = File(...)):
    """
    Импорт готового JSON из Claude / ChatGPT:
    Обновляет не только 'rus_text', но и автоматически распознанного персонажа 'speaker'!
    """
    try:
        raw_bytes = await file.read()
        text = raw_bytes.decode("utf-8").strip()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка чтения файла (требуется UTF-8): {e}")

    if "```" in text:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            text = match.group(1).strip()

    try:
        data = json.loads(text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Некорректный формат JSON: {e}")

    dialogues = data.get("dialogues")
    if not dialogues or not isinstance(dialogues, list):
        raise HTTPException(status_code=400, detail="В JSON отсутствует список 'dialogues'")

    updated_count = 0
    updated_speakers_count = 0

    with db_session() as cur:
        for item in dialogues:
            b_id = item.get("id")
            ru_text = item.get("ru", "").strip()
            imported_speaker = item.get("speaker", "").strip()

            if not b_id or (not ru_text and not imported_speaker):
                continue

            cur.execute("SELECT rus_text, speaker FROM text_blocks WHERE id = ?", (b_id,))
            current = cur.fetchone()
            if not current:
                continue

            final_ru = ru_text if ru_text else current["rus_text"]
            # Если в базе спикер был пустой, а Claude его определил — сохраняем спикера
            final_spk = current["speaker"]
            if imported_speaker:
                if not current["speaker"] or current["speaker"] != imported_speaker:
                    final_spk = imported_speaker
                    updated_speakers_count += 1

            new_status = "translated" if final_ru else "ocr-done"

            cur.execute(
                """
                UPDATE text_blocks 
                SET rus_text = ?, speaker = ?, status = ? 
                WHERE id = ?
                """,
                (final_ru, final_spk, new_status, b_id)
            )
            updated_count += 1

        cur.execute(
            """
            UPDATE pages 
            SET status = 'translated' 
            WHERE chapter_id = ? AND status NOT IN ('done', 'cleaned')
            """,
            (chapter_id,)
        )

    logger.info(
        f"Импорт перевода для главы {chapter_id}: обновлено реплик: {updated_count}, "
        f"автоматически распознано спикеров: {updated_speakers_count}"
    )

    return {
        "success": True,
        "updated_count": updated_count,
        "updated_speakers_count": updated_speakers_count
    }
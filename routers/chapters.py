import json
from fastapi import APIRouter, HTTPException
from database import get_db, db_session
from PIL import Image
from ml.models import ml
from services.detector import detect_and_filter_bubbles

router = APIRouter(prefix="/api/chapters", tags=["Chapters"])


@router.post("/{chapter_id}/translate-all")
async def translate_entire_chapter(chapter_id: int):
    """
    Пакетная обработка ВСЕЙ главы за 1 сетевой запрос к Gemini:
    1. Авто-детект (YOLO) для неразмеченных страниц
    2. Авто-OCR (MangaOCR) на GPU для всех баблов без сети
    3. Единый запрос на перевод всей главы в Gemini
    4. Сохранение переводов в SQLite
    """
    conn = get_db()
    cursor = conn.cursor()

    # 1. Получаем все страницы главы
    cursor.execute("SELECT id, page_number, file_path FROM pages WHERE chapter_id = ? ORDER BY page_number ASC",
                   (chapter_id,))
    pages = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not pages:
        raise HTTPException(status_code=404, detail="Страницы главы не найдены")

    chapter_dialogue = []  # Список для Gemini: [{"id": block_id, "speaker": ..., "text": ...}]

    for page in pages:
        page_id = page["id"]
        img_path = page["file_path"]

        # Проверяем, есть ли уже блоки в БД
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, x, y, width, height, jap_text, rus_text, speaker, order_index FROM text_blocks WHERE page_id = ? ORDER BY order_index ASC",
            (page_id,))
        blocks = [dict(r) for r in cur.fetchall()]
        conn.close()

        img = None

        # Если баблы ещё не задетекчены — детектим локально через YOLO
        if not blocks:
            img = Image.open(img_path).convert("RGB")
            detected_boxes = detect_and_filter_bubbles(img)

            with db_session() as cur:
                for b in detected_boxes:
                    block_id = str(crypto_uuid())  # или uuid.uuid4().hex
                    cur.execute(
                        "INSERT INTO text_blocks (id, page_id, x, y, width, height, order_index, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'new')",
                        (block_id, page_id, b["x"], b["y"], b["width"], b["height"], b["order_index"])
                    )

            # Перечитываем созданные блоки
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                "SELECT id, x, y, width, height, jap_text, rus_text, speaker, order_index FROM text_blocks WHERE page_id = ? ORDER BY order_index ASC",
                (page_id,))
            blocks = [dict(r) for r in cur.fetchall()]
            conn.close()

        # Если японский текст ещё не распознан — запускаем локальный MangaOCR
        for b in blocks:
            if not b["jap_text"]:
                if img is None:
                    img = Image.open(img_path).convert("RGB")

                # Кропаем бабл прямо в памяти
                w, h = img.size
                crop_box = (
                    int(b["x"] * w),
                    int(b["y"] * h),
                    int((b["x"] + b["width"]) * w),
                    int((b["y"] + b["height"]) * h)
                )
                crop_img = img.crop(crop_box)
                jap_text = ml.mocr(crop_img)
                b["jap_text"] = jap_text

                # Обновляем текст в БД
                with db_session() as cur:
                    cur.execute("UPDATE text_blocks SET jap_text = ?, status = 'ocr-done' WHERE id = ?",
                                (jap_text, b["id"]))

            if b["jap_text"].strip():
                chapter_dialogue.append({
                    "id": b["id"],
                    "speaker": b["speaker"],
                    "text": b["jap_text"],
                    "page": page["page_number"]
                })

    if not chapter_dialogue:
        return {"success": True, "message": "Нет текста для перевода"}

    # 5. ОТПРАВЛЯЕМ РОВНО 1 ЗАПРОС В GEMINI СО ВСЕЙ ГЛАВОЙ
    lines = []
    for i, item in enumerate(chapter_dialogue):
        spk = f"[{item['speaker']}]: " if item['speaker'] else ""
        lines.append(f"[{i + 1}] (Стр. {item['page']}) {spk}{item['text']}")

    full_text = "\n".join(lines)
    prompt = (
        "Ты литературный переводчик манги. Перед тобой полный текст главы манги по порядку чтения.\n"
        "Переведи все реплики на русский язык с учётом общего контекста сюжета и характера персонажей.\n"
        "Формат ответа СТРОГО: [номер] Русский перевод реплики (без префикса персонажа и номера страницы).\n\n"
        f"Оригинал:\n{full_text}"
    )

    response = ml.gemini_model.generate_content(prompt)
    raw_lines = response.text.strip().split("\n")

    # 6. Сохраняем переводы обратно в БД
    with db_session() as cur:
        for line in raw_lines:
            line = line.strip()
            if line.startswith("[") and "]" in line:
                idx_part, trans = line.split("]", 1)
                idx_str = idx_part.replace("[", "").strip()
                if idx_str.isdigit():
                    idx = int(idx_str) - 1
                    if 0 <= idx < len(chapter_dialogue):
                        block_id = chapter_dialogue[idx]["id"]
                        cur.execute(
                            "UPDATE text_blocks SET rus_text = ?, status = 'translated' WHERE id = ?",
                            (trans.strip(), block_id)
                        )

    return {"success": True, "translated_blocks": len(chapter_dialogue)}
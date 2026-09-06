import os
import time
import subprocess
import cv2
from PIL import Image
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from database import get_db, db_session
from schemas import SavePageBlocksRequest
from services.cleaner import clean_speech_bubble
from services.detector import detect_and_filter_bubbles

router = APIRouter(prefix="/api/pages", tags=["Pages"])


@router.get("/{page_id}/image")
async def get_page_image(page_id: int):
    """Отдаёт исходный файл скана по page_id."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row or not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Файл страницы не найден на диске")

    return FileResponse(row["file_path"])


@router.get("/{page_id}/clean-image")
async def get_page_clean_image(page_id: int):
    """Отдаёт очищенный скан, если он существует, иначе оригинал."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, clean_path FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    target = row["clean_path"] if row["clean_path"] and os.path.exists(row["clean_path"]) else row["file_path"]
    return FileResponse(target)


@router.get("/{page_id}/blocks")
async def get_page_blocks(page_id: int):
    """Возвращает сохранённые блоки, отсортированные по order_index."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, page_id, x, y, width, height, jap_text, rus_text, speaker, order_index, status 
        FROM text_blocks 
        WHERE page_id = ?
        ORDER BY order_index ASC
        """,
        (page_id,)
    )
    blocks = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"success": True, "blocks": blocks}


@router.post("/{page_id}/blocks")
async def save_page_blocks(page_id: int, req: SavePageBlocksRequest):
    """Сохраняет баблы с сохранением их персонажа и порядкового номера."""
    try:
        with db_session() as cursor:
            cursor.execute("SELECT id FROM pages WHERE id = ?", (page_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Страница не найдена")

            cursor.execute("DELETE FROM text_blocks WHERE page_id = ?", (page_id,))

            for idx, b in enumerate(req.blocks):
                # Если с фронта не пришёл order_index, используем индекс в массиве
                current_order = b.order_index if b.order_index else (idx + 1)

                cursor.execute(
                    """
                    INSERT INTO text_blocks (id, page_id, x, y, width, height, jap_text, rus_text, speaker, order_index, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (b.id, page_id, b.x, b.y, b.width, b.height, b.jap_text, b.rus_text, b.speaker, current_order,
                     b.status)
                )

            has_translated = any(b.status == "translated" for b in req.blocks)
            page_status = "in_progress" if req.blocks else "new"
            if has_translated and all(b.status == "translated" for b in req.blocks):
                page_status = "done"

            cursor.execute("UPDATE pages SET status = ? WHERE id = ?", (page_status, page_id))

        return {"success": True, "saved_count": len(req.blocks), "page_status": page_status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{page_id}/detect")
async def detect_page_bubbles_by_id(page_id: int):
    """Быстрая детекция: чтение картинки напрямую с SSD без передачи байтов по сети."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row or not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Файл не найден на диске")

    try:
        start_time = time.time()
        image = Image.open(row["file_path"]).convert("RGB")
        boxes = detect_and_filter_bubbles(image)
        return {
            "success": True,
            "boxes": boxes,
            "time_seconds": round(time.time() - start_time, 4)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{page_id}/clean")
async def clean_page_bubbles(page_id: int):
    """Запускает OpenCV клин для всех баблов страницы и сохраняет в папку clean/."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row or not os.path.exists(page_row["file_path"]):
        conn.close()
        raise HTTPException(status_code=404, detail="Файл страницы не найден")

    cursor.execute("SELECT x, y, width, height FROM text_blocks WHERE page_id = ?", (page_id,))
    boxes = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not boxes:
        return {"success": False, "error": "Нет размеченных баблов для очистки"}

    orig_path = page_row["file_path"]
    image = cv2.imread(orig_path)
    if image is None:
        raise HTTPException(status_code=500, detail="Не удалось открыть картинку через OpenCV")

    # Очищаем каждый бабл
    for box in boxes:
        clean_speech_bubble(image, box)

    # Сохраняем в подпапку clean/
    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    clean_path = os.path.join(clean_dir, f"{file_name}.png")
    cv2.imwrite(clean_path, image)

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = ? WHERE id = ?", (clean_path, page_id))

    return {"success": True, "clean_path": clean_path}


@router.post("/{page_id}/save-translated")
async def save_translated_page(page_id: int, file: UploadFile = File(...)):
    """Сохраняет готовую запечённую страницу в подпапку translated/."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row or not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Страница не найдена")

    orig_path = row["file_path"]
    translated_dir = os.path.join(os.path.dirname(orig_path), "translated")
    os.makedirs(translated_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    final_path = os.path.join(translated_dir, f"{file_name}.png")

    image_bytes = await file.read()
    with open(final_path, "wb") as f:
        f.write(image_bytes)

    with db_session() as cur:
        cur.execute("UPDATE pages SET status = 'done' WHERE id = ?", (page_id,))

    return {"success": True, "saved_path": final_path}


@router.post("/{page_id}/open-folder")
async def open_translated_folder(page_id: int):
    """Открывает папку 'translated' в проводнике Windows."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    translated_dir = os.path.join(os.path.dirname(row["file_path"]), "translated")
    os.makedirs(translated_dir, exist_ok=True)

    subprocess.Popen(f'explorer "{translated_dir}"')
    return {"success": True}
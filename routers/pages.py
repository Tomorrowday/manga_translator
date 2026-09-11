import os
import uuid
import time
import subprocess
import cv2
import shutil
from PIL import Image
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from database import get_db, db_session
from schemas import SavePageBlocksRequest, SpotCleanRequest
from services.cleaner import clean_speech_bubble, spot_clean_region
from services.detector import detect_and_filter_bubbles
from services.ocr import ocr_image_region
from logger import logger

router = APIRouter(prefix="/api/pages", tags=["Pages"])


@router.get("/{page_id}")
async def get_page_details(page_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT p.id, p.chapter_id, p.page_number, p.file_path, p.clean_path, p.status, c.title_id
        FROM pages p
        JOIN chapters c ON c.id = p.chapter_id
        WHERE p.id = ?
        """,
        (page_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    page_data = dict(row)
    if page_data.get("clean_path") and not os.path.exists(page_data["clean_path"]):
        page_data["clean_path"] = None

    return {"success": True, "page": page_data}


@router.get("/{page_id}/speakers")
async def get_page_speakers(page_id: int):
    conn = get_db()
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
        conn.close()
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
    conn.close()

    combined = []
    seen = set()
    for name in glossary_names + used_names:
        if name and name.lower() not in seen:
            seen.add(name.lower())
            combined.append(name)

    return {"success": True, "speakers": sorted(combined)}


@router.get("/{page_id}/image")
async def get_page_image(page_id: int):
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
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, page_id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index,
               font_size, font_family, is_bold, is_italic, is_uppercase, has_stroke,
               shape, padding_mode, status 
        FROM text_blocks 
        WHERE page_id = ?
        ORDER BY order_index ASC
        """,
        (page_id,)
    )
    blocks = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"success": True, "blocks": blocks}


async def _save_blocks_logic(page_id: int, req: SavePageBlocksRequest):
    with db_session() as cursor:
        cursor.execute("SELECT status, clean_path FROM pages WHERE id = ?", (page_id,))
        page_row = cursor.fetchone()
        if not page_row:
            raise HTTPException(status_code=404, detail="Страница не найдена")

        current_status = page_row["status"]
        cursor.execute("DELETE FROM text_blocks WHERE page_id = ?", (page_id,))

        for idx, b in enumerate(req.blocks):
            current_order = b.order_index if b.order_index else (idx + 1)
            shape_val = b.shape if b.shape in ["rect", "ellipse"] else "rect"
            pad_mode = b.padding_mode if b.padding_mode in ["safe", "fit"] else "safe"

            clamped_x = max(0.0, min(0.995, float(b.x)))
            clamped_y = max(0.0, min(0.995, float(b.y)))
            clamped_w = max(0.005, min(1.0 - clamped_x, float(b.width)))
            clamped_h = max(0.005, min(1.0 - clamped_y, float(b.height)))

            # Нормализация угла в диапазон [-180, 180]
            raw_rot = float(b.rotation or 0.0)
            normalized_rot = ((raw_rot + 180.0) % 360.0) - 180.0

            cursor.execute(
                """
                INSERT INTO text_blocks (
                    id, page_id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index,
                    font_size, font_family, is_bold, is_italic, is_uppercase, has_stroke,
                    shape, padding_mode, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    b.id, page_id, clamped_x, clamped_y, clamped_w, clamped_h, round(normalized_rot, 2),
                    b.jap_text, b.rus_text, b.speaker,
                    current_order, b.font_size, b.font_family, int(b.is_bold or False),
                    int(b.is_italic or False), int(b.is_uppercase or False),
                    int(b.has_stroke or False), shape_val, pad_mode, b.status
                )
            )

        has_rus = any(bool(b.rus_text and b.rus_text.strip()) for b in req.blocks)

        if current_status == "done":
            page_status = "done"
        elif page_row["clean_path"] and os.path.exists(page_row["clean_path"]):
            page_status = "cleaned"
        elif has_rus:
            page_status = "translated"
        elif req.blocks:
            page_status = "detected"
        else:
            page_status = "raw"

        cursor.execute("UPDATE pages SET status = ? WHERE id = ?", (page_status, page_id))

    return {"success": True, "saved_count": len(req.blocks), "page_status": page_status}


@router.post("/{page_id}/blocks")
async def save_page_blocks(page_id: int, req: SavePageBlocksRequest):
    try:
        return await _save_blocks_logic(page_id, req)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{page_id}/blocks")
async def update_page_blocks(page_id: int, req: SavePageBlocksRequest):
    try:
        return await _save_blocks_logic(page_id, req)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{page_id}/detect")
async def detect_page_bubbles_by_id(page_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, status FROM pages WHERE id = ?", (page_id,))
    row = cursor.fetchone()
    conn.close()

    if not row or not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Файл не найден на диске")

    try:
        start_time = time.time()
        image = Image.open(row["file_path"]).convert("RGB")
        boxes = detect_and_filter_bubbles(image)

        with db_session() as cur:
            cur.execute("DELETE FROM text_blocks WHERE page_id = ?", (page_id,))
            for b in boxes:
                block_id = str(uuid.uuid4())
                b["id"] = block_id
                b["shape"] = "rect"
                b["padding_mode"] = "safe"
                b["rotation"] = 0.0

                jap_text = ocr_image_region(image, b["x"], b["y"], b["width"], b["height"], rotation=0.0)
                b["jap_text"] = jap_text
                b["status"] = "ocr-done" if jap_text else "new"

                cur.execute(
                    """
                    INSERT INTO text_blocks (
                        id, page_id, x, y, width, height, rotation, jap_text, order_index, shape, padding_mode, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 0.0, ?, ?, 'rect', 'safe', ?)
                    """,
                    (block_id, page_id, b["x"], b["y"], b["width"], b["height"], jap_text, b["order_index"], b["status"])
                )

            new_status = "detected" if boxes else "raw"
            if row["status"] not in ["translated", "cleaned", "done"]:
                cur.execute("UPDATE pages SET status = ? WHERE id = ?", (new_status, page_id))

        return {
            "success": True,
            "boxes": boxes,
            "page_status": new_status,
            "time_seconds": round(time.time() - start_time, 4)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{page_id}/clean")
async def clean_page_bubbles(page_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row or not os.path.exists(page_row["file_path"]):
        conn.close()
        raise HTTPException(status_code=404, detail="Файл страницы не найден")

    cursor.execute("SELECT x, y, width, height, shape, rotation FROM text_blocks WHERE page_id = ?", (page_id,))
    boxes = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not boxes:
        return {"success": False, "error": "Нет размеченных баблов для очистки"}

    orig_path = page_row["file_path"]
    image = cv2.imread(orig_path)
    if image is None:
        raise HTTPException(status_code=500, detail="Не удалось открыть картинку через OpenCV")

    stats = {"white": 0, "inpaint": 0}
    for box in boxes:
        method = clean_speech_bubble(image, box)
        if method in stats:
            stats[method] += 1

    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    clean_path = os.path.join(clean_dir, f"{file_name}.png")
    cv2.imwrite(clean_path, image)

    new_status = "done" if page_row["status"] == "done" else "cleaned"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = ?, status = ? WHERE id = ?", (clean_path, new_status, page_id))

    return {
        "success": True,
        "clean_path": clean_path,
        "page_status": new_status,
        "whitened": stats["white"],
        "inpainted": stats["inpaint"]
    }


@router.delete("/{page_id}/clean")
async def revert_page_clean(page_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, clean_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Страница не найдена")

    clean_path = page_row["clean_path"]

    if clean_path and os.path.exists(clean_path):
        try:
            os.remove(clean_path)
            logger.info(f"Файл клина удален: {clean_path}")
        except Exception as e:
            logger.warning(f"Не удалось удалить файл {clean_path}: {e}")

    cursor.execute("SELECT jap_text, rus_text FROM text_blocks WHERE page_id = ?", (page_id,))
    blocks = cursor.fetchall()
    conn.close()

    has_rus = any(bool(b["rus_text"] and b["rus_text"].strip()) for b in blocks)
    if has_rus:
        new_status = "translated"
    elif blocks:
        new_status = "detected"
    else:
        new_status = "raw"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = NULL, status = ? WHERE id = ?", (new_status, page_id))

    logger.info(f"Клин страницы {page_id} успешно откачен. Новый статус: {new_status}")

    return {
        "success": True,
        "page_status": new_status,
        "message": "Клин страницы успешно откачен"
    }


@router.post("/{page_id}/clean-spot")
async def spot_clean_page(page_id: int, req: SpotCleanRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, clean_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()
    conn.close()

    if not page_row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    orig_path = page_row["file_path"]
    clean_path = page_row["clean_path"]

    source_path = clean_path if clean_path and os.path.exists(clean_path) else orig_path

    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Исходный файл страницы не найден на диске")

    image = cv2.imread(source_path)
    if image is None:
        raise HTTPException(status_code=500, detail="Не удалось открыть изображение")

    box_dict = {"x": req.x, "y": req.y, "width": req.width, "height": req.height}
    used_method = spot_clean_region(image, box_dict, method=req.method or "auto")

    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    final_clean_path = os.path.join(clean_dir, f"{file_name}.png")
    cv2.imwrite(final_clean_path, image)

    new_status = "done" if page_row["status"] == "done" else "cleaned"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = ?, status = ? WHERE id = ?", (final_clean_path, new_status, page_id))

    return {
        "success": True,
        "clean_path": final_clean_path,
        "page_status": new_status,
        "method": used_method,
        "timestamp": int(time.time() * 1000)
    }


@router.post("/{page_id}/save-translated")
async def save_translated_page(page_id: int, file: UploadFile = File(...)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()
    conn.close()

    if not page_row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    orig_path = page_row["file_path"]
    translated_dir = os.path.join(os.path.dirname(orig_path), "translated")
    os.makedirs(translated_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    final_path = os.path.join(translated_dir, f"{file_name}.png")

    try:
        with open(final_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось сохранить файл: {e}")

    with db_session() as cur:
        cur.execute("UPDATE pages SET status = 'done' WHERE id = ?", (page_id,))

    return {"success": True, "saved_path": final_path, "page_status": "done"}


@router.post("/{page_id}/open-folder")
async def open_translated_folder(page_id: int):
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
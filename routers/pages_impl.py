# routers/pages_impl.py
# Реализация бизнес-логики эндпоинтов страниц манги, баблов, клина и резервной копии отката шага клина

import os
import subprocess
import shutil
import time
import base64
import mimetypes
from pathlib import Path
from typing import Optional
import cv2
import numpy as np
from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from database import get_db, db_session
from schemas import SavePageBlocksRequest, SpotCleanRequest
from schemas.blocks import BrushCleanRequest
from services.cleaner import spot_clean_region, inpaint_by_brush_mask, load_image_cv2, save_image_cv2, release_vram
from services.page_service import (
    get_active_global_settings,
    save_page_blocks_service,
    detect_page_bubbles_service,
    clean_page_bubbles_service,
    revert_page_clean_service,
)


def _get_clean_backup_path(orig_path: str) -> str:
    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(orig_path))[0]
    return os.path.join(clean_dir, f"{base_name}_undo_backup.png")


def _backup_clean_file_if_exists(orig_path: str, clean_path: Optional[str]) -> None:
    if clean_path and os.path.exists(clean_path):
        backup_path = _get_clean_backup_path(orig_path)
        try:
            shutil.copy2(clean_path, backup_path)
        except Exception:
            pass


def serve_image_file_safely(file_path: str) -> Response:
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Файл изображения не найден на диске")

    try:
        data = Path(file_path).read_bytes()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось прочитать файл: {e}")

    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "image/png" if file_path.lower().endswith(".png") else "image/jpeg"

    return Response(
        content=data,
        media_type=mime_type,
        headers={
            "Content-Length": str(len(data)),
            "Cache-Control": "public, max-age=3600",
        }
    )


def release_vram_endpoint():
    try:
        release_vram()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_page_details(page_id: int):
    with get_db() as conn:
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

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    page_data = dict(row)
    if page_data.get("clean_path") and not os.path.exists(page_data["clean_path"]):
        page_data["clean_path"] = None

    return {"success": True, "page": page_data}


def get_page_speakers(page_id: int):
    with get_db() as conn:
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

    combined = []
    seen = set()
    for name in glossary_names + used_names:
        if name and name.lower() not in seen:
            seen.add(name.lower())
            combined.append(name)

    return {"success": True, "speakers": sorted(combined)}


def get_page_image(page_id: int) -> Response:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
        row = cursor.fetchone()

    if not row or not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Файл страницы не найден на диске")

    return serve_image_file_safely(row["file_path"])


def get_page_clean_image(page_id: int) -> Response:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path, clean_path FROM pages WHERE id = ?", (page_id,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    target = row["clean_path"] if row["clean_path"] and os.path.exists(row["clean_path"]) else row["file_path"]
    return serve_image_file_safely(target)


def get_page_blocks(page_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, page_id, class_id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index,
                   font_size, font_family, is_bold, is_italic, is_uppercase, has_stroke, text_color,
                   shape, padding_mode, min_hyphens, status 
            FROM text_blocks 
            WHERE page_id = ?
            ORDER BY order_index ASC
            """,
            (page_id,)
        )
        blocks = [dict(r) for r in cursor.fetchall()]

    return {"success": True, "blocks": blocks}


def save_page_blocks_endpoint(page_id: int, req: SavePageBlocksRequest):
    try:
        page_status = save_page_blocks_service(page_id, req.blocks)
        return {"success": True, "saved_count": len(req.blocks), "page_status": page_status}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def detect_page_bubbles_by_id(
    page_id: int,
    conf: Optional[float] = None,
    auto_oval: Optional[bool] = None
):
    try:
        boxes, new_status, elapsed = detect_page_bubbles_service(
            page_id,
            conf_override=conf,
            auto_oval_override=auto_oval
        )
        return {
            "success": True,
            "boxes": boxes,
            "page_status": new_status,
            "time_seconds": elapsed
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        return {"success": False, "error": str(e)}


def clean_page_bubbles(page_id: int, mode: str = "auto"):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT file_path, clean_path FROM pages WHERE id = ?", (page_id,))
            row = cur.fetchone()
            if row:
                _backup_clean_file_if_exists(str(row["file_path"]), row["clean_path"])

        clean_path, new_status, stats = clean_page_bubbles_service(page_id, clean_mode=mode)
        return {
            "success": True,
            "clean_path": clean_path,
            "page_status": new_status,
            "whitened": stats["white"],
            "inpainted": stats["inpaint"]
        }
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def revert_page_clean(page_id: int):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
            row = cur.fetchone()
            if row and row["file_path"]:
                backup_path = _get_clean_backup_path(str(row["file_path"]))
                if os.path.exists(backup_path):
                    try:
                        os.remove(backup_path)
                    except Exception:
                        pass

        new_status = revert_page_clean_service(page_id)
        return {"success": True, "page_status": new_status, "message": "Клин страницы успешно откачен"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def undo_last_clean_step(page_id: int):
    """Откатывает последний шаг Spot Clean / Brush Clean из сохранённого бэкапа."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT file_path, clean_path, status FROM pages WHERE id = ?", (page_id,))
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    orig_path = str(row["file_path"])
    clean_path = str(row["clean_path"]) if row["clean_path"] else ""
    backup_path = _get_clean_backup_path(orig_path)

    if os.path.exists(backup_path) and clean_path:
        try:
            shutil.copy2(backup_path, clean_path)
            os.remove(backup_path)
            return {
                "success": True,
                "restored_from_backup": True,
                "clean_path": clean_path,
                "page_status": row["status"],
                "timestamp": int(time.time() * 1000),
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка восстановления бэкапа клина: {e}")

    if clean_path and os.path.exists(clean_path):
        new_status = revert_page_clean_service(page_id)
        return {
            "success": True,
            "restored_from_backup": False,
            "clean_path": None,
            "page_status": new_status,
            "timestamp": int(time.time() * 1000),
        }

    return {"success": False, "error": "Нет шагов клина для отката"}


def spot_clean_page(page_id: int, req: SpotCleanRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.file_path, p.clean_path, p.status
            FROM pages p
            WHERE p.id = ?
            """,
            (page_id,)
        )
        page_row = cursor.fetchone()

    if not page_row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    orig_path = str(page_row["file_path"])
    existing_clean = str(page_row["clean_path"]) if page_row["clean_path"] and os.path.exists(page_row["clean_path"]) else None
    _backup_clean_file_if_exists(orig_path, existing_clean)

    source_path = existing_clean if existing_clean else orig_path

    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Исходный файл страницы не найден")

    try:
        image = load_image_cv2(source_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось открыть изображение: {e}")

    box_dict = {
        "x": req.x,
        "y": req.y,
        "width": req.width,
        "height": req.height,
        "rotation": req.rotation or 0.0,
        "shape": req.shape or "rect"
    }
    cfg = get_active_global_settings()
    clean_model_name = cfg.get("clean_model") or "anime-manga-big-lama.pt"

    try:
        used_method = spot_clean_region(image, box_dict, method=req.method or "auto", clean_model_name=clean_model_name)
    finally:
        release_vram()

    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)
    final_clean_path = str(os.path.join(clean_dir, f"{os.path.splitext(os.path.basename(orig_path))[0]}.png"))

    save_image_cv2(final_clean_path, image)

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


def brush_clean_page(page_id: int, req: BrushCleanRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.file_path, p.clean_path, p.status
            FROM pages p
            WHERE p.id = ?
            """,
            (page_id,)
        )
        page_row = cursor.fetchone()

    if not page_row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    orig_path = str(page_row["file_path"])
    existing_clean = str(page_row["clean_path"]) if page_row["clean_path"] and os.path.exists(page_row["clean_path"]) else None
    _backup_clean_file_if_exists(orig_path, existing_clean)

    source_path = existing_clean if existing_clean else orig_path

    try:
        image = load_image_cv2(source_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось открыть изображение: {e}")

    try:
        raw_b64 = req.mask_base64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        mask_bytes = base64.b64decode(raw_b64)
        mask_arr = np.frombuffer(mask_bytes, dtype=np.uint8)
        mask_img = cv2.imdecode(mask_arr, cv2.IMREAD_GRAYSCALE)

        if mask_img is None:
            raise ValueError("Не удалось декодировать маску")

        if mask_img.shape[:2] != image.shape[:2]:
            mask_img = cv2.resize(mask_img, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка обработки маски: {e}")

    cfg = get_active_global_settings()
    clean_model_name = cfg.get("clean_model") or "anime-manga-big-lama.pt"

    try:
        inpaint_by_brush_mask(image, mask_img, mode=req.mode or "lama", clean_model_name=clean_model_name)
    finally:
        release_vram()

    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)
    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    final_clean_path = str(os.path.join(clean_dir, f"{file_name}.png"))

    save_image_cv2(final_clean_path, image)

    new_status = "done" if page_row["status"] == "done" else "cleaned"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = ?, status = ? WHERE id = ?", (final_clean_path, new_status, page_id))

    return {
        "success": True,
        "clean_path": final_clean_path,
        "page_status": new_status,
        "timestamp": int(time.time() * 1000)
    }


def save_translated_page(page_id: int, file: UploadFile):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
        page_row = cursor.fetchone()

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


def open_translated_folder(page_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    translated_dir = os.path.join(os.path.dirname(row["file_path"]), "translated")
    os.makedirs(translated_dir, exist_ok=True)
    subprocess.Popen(f'explorer "{translated_dir}"')
    return {"success": True}
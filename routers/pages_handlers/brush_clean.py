import os
import time
import base64
import cv2
import numpy as np
from fastapi import HTTPException
from database import get_db, db_session
from schemas.blocks import BrushCleanRequest
from routers.pages_handlers.common import _backup_clean_file_if_exists
from services.cleaner import inpaint_by_brush_mask, load_image_cv2, save_image_cv2, release_vram
from services.page_service import get_active_global_settings


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

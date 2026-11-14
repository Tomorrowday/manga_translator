import os
import time
from fastapi import HTTPException
from database import get_db, db_session
from schemas import SpotCleanRequest
from routers.pages_handlers.common import _backup_clean_file_if_exists
from services.cleaner import spot_clean_region, load_image_cv2, save_image_cv2, release_vram
from services.page_service import get_active_global_settings


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

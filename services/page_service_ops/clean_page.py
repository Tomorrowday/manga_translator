# services/page_service_ops/clean_page.py
# Пакетный клин баблов страницы (Auto / White / LaMa) и откат клина

import os
from typing import Dict, Tuple

from database import get_db, db_session
from services.cleaner import clean_speech_bubble, load_image_cv2, save_image_cv2, release_vram
from services.page_service_ops.active_settings import get_active_global_settings
from logger import logger


def clean_page_bubbles_service(page_id: int, clean_mode: str = "auto") -> Tuple[str, str, Dict[str, int]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, clean_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row or not os.path.exists(str(page_row["file_path"])):
        conn.close()
        raise ValueError("Файл страницы не найден")

    cfg = get_active_global_settings()
    clean_model_name = cfg.get("clean_model") or "anime-manga-big-lama.pt"

    cursor.execute(
        "SELECT x, y, width, height, shape, rotation, rus_text, class_id FROM text_blocks WHERE page_id = ?",
        (page_id,)
    )
    blocks = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not blocks:
        raise ValueError("Нет размеченных баблов для очистки")

    orig_path = str(page_row["file_path"])
    clean_path_raw = str(page_row["clean_path"]) if page_row["clean_path"] else ""

    source_path = clean_path_raw if clean_path_raw and os.path.exists(clean_path_raw) else orig_path

    try:
        image = load_image_cv2(source_path)
    except Exception as e:
        raise RuntimeError(f"Не удалось открыть изображение: {e}")

    stats = {"white": 0, "inpaint": 0}
    try:
        for box in blocks:
            method = clean_speech_bubble(image, box, force_mode=clean_mode, clean_model_name=clean_model_name)
            if method in stats:
                stats[method] += 1
    finally:
        release_vram()

    clean_dir = os.path.join(os.path.dirname(orig_path), "clean")
    os.makedirs(clean_dir, exist_ok=True)

    file_name = os.path.splitext(os.path.basename(orig_path))[0]
    clean_path = str(os.path.join(clean_dir, f"{file_name}.png"))

    save_ok = save_image_cv2(clean_path, image)
    if not save_ok:
        raise RuntimeError(f"Не удалось сохранить заклиненный файл по пути: {clean_path}")

    page_status_str = str(page_row["status"])
    has_rus = any(bool(b.get("rus_text") and b["rus_text"].strip()) for b in blocks)

    if page_status_str == "done":
        new_status = "done"
    elif has_rus or page_status_str == "translated":
        new_status = "translated"
    else:
        new_status = "cleaned"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = ?, status = ? WHERE id = ?", (clean_path, new_status, page_id))

    return clean_path, new_status, stats


def revert_page_clean_service(page_id: int) -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, clean_path, status FROM pages WHERE id = ?", (page_id,))
    page_row = cursor.fetchone()

    if not page_row:
        conn.close()
        raise ValueError("Страница не найдена")

    clean_path_raw = page_row["clean_path"]
    if clean_path_raw:
        clean_path = str(clean_path_raw)
        if os.path.exists(clean_path):
            try:
                os.remove(clean_path)
                logger.info(f"Файл клина удален: {clean_path}")
            except Exception as e:
                logger.warning(f"Не удалось удалить файл {clean_path}: {e}")

    cursor.execute("SELECT jap_text, rus_text FROM text_blocks WHERE page_id = ?", (page_id,))
    blocks = cursor.fetchall()
    conn.close()

    has_rus = any(bool(b["rus_text"] and b["rus_text"].strip()) for b in blocks)
    new_status = "translated" if has_rus else "detected" if blocks else "raw"

    with db_session() as cur:
        cur.execute("UPDATE pages SET clean_path = NULL, status = ? WHERE id = ?", (new_status, page_id))

    return new_status

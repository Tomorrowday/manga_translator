import os
from fastapi import HTTPException
from fastapi.responses import Response
from database import get_db
from routers.pages_handlers.common import serve_image_file_safely


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

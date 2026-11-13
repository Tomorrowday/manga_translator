import os
import shutil
import mimetypes
from pathlib import Path
from typing import Optional
from fastapi import HTTPException
from fastapi.responses import Response


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

# routers/chapters.py
# HTTP-контроллер для работы с главами (раздельный экспорт, чистый импорт, сброс шрифтов)

import os
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from database import db_session
from logger import logger
from services.chapter_service import (
    build_chapter_export_payloads,
    export_chapter_dialogue_to_folder,
    import_chapter_dialogue_payload,
    get_chapter_folder_path,
    find_latest_dialogue_json_in_folder,
)

router = APIRouter(prefix="/api/chapters", tags=["Chapters"])


@router.delete("/{chapter_id}")
async def delete_chapter(chapter_id: int):
    try:
        with db_session() as cur:
            cur.execute(
                """
                DELETE FROM text_blocks 
                WHERE page_id IN (SELECT id FROM pages WHERE chapter_id = ?)
                """,
                (chapter_id,)
            )
            cur.execute("DELETE FROM pages WHERE chapter_id = ?", (chapter_id,))
            cur.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))

        logger.info(f"Глава ID {chapter_id} успешно удалена из базы.")
        return {"success": True, "message": "Глава успешно удалена"}
    except Exception as e:
        logger.error(f"Ошибка при удалении главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/reset-fonts")
async def reset_chapter_fonts(chapter_id: int):
    """Сбрасывает размеры всех баблов главы в Auto (font_size = NULL)."""
    try:
        with db_session() as cur:
            cur.execute(
                """
                UPDATE text_blocks
                SET font_size = NULL
                WHERE page_id IN (SELECT id FROM pages WHERE chapter_id = ?)
                """,
                (chapter_id,)
            )
        logger.info(f"Шрифты всех баблов главы {chapter_id} сброшены в Auto.")
        return {"success": True, "message": "Все баблы главы переведены в Auto"}
    except Exception as e:
        logger.error(f"Ошибка сброса шрифтов главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{chapter_id}/export-dialogue")
async def export_chapter_dialogue(chapter_id: int):
    """Скачивание чистого JSON файла диалогов в браузере."""
    try:
        _, dialogues_json, _, dialogues_filename, chapter_folder = build_chapter_export_payloads(chapter_id)
        encoded_filename = quote(dialogues_filename)

        return Response(
            content=dialogues_json,
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка экспорта скрипта главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/export-dialogue-to-folder")
async def export_chapter_dialogue_to_folder_endpoint(chapter_id: int):
    """Сохраняет оба файла (_context.json и _dialogues.json) прямо в папку главы на диске."""
    try:
        res = export_chapter_dialogue_to_folder(chapter_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка сохранения скриптов в папку главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/import-dialogue")
async def import_chapter_dialogue(chapter_id: int, file: UploadFile = File(...)):
    try:
        raw_bytes = await file.read()
        res = import_chapter_dialogue_payload(chapter_id, raw_bytes)
        return {"success": True, **res}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка импорта скрипта главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/pick-and-import-dialogue")
async def pick_and_import_dialogue_endpoint(chapter_id: int):
    folder = get_chapter_folder_path(chapter_id)
    initial_dir = folder if (folder and os.path.exists(folder)) else os.getcwd()

    selected_file = None
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)

        selected_file = filedialog.askopenfilename(
            title="Выберите JSON скрипт диалогов главы",
            initialdir=initial_dir,
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        root.destroy()
    except Exception as e:
        logger.warning(f"Диалог выбора не открылся ({e}).")

    if not selected_file:
        return {"success": False, "cancelled": True}

    try:
        raw_bytes = Path(selected_file).read_bytes()
        res = import_chapter_dialogue_payload(chapter_id, raw_bytes)
        return {"success": True, "file_path": selected_file, **res}
    except Exception as e:
        logger.error(f"Ошибка импорта файла {selected_file}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{chapter_id}/import-dialogue-from-folder")
async def import_dialogue_from_folder_endpoint(chapter_id: int):
    latest_json = find_latest_dialogue_json_in_folder(chapter_id)
    if not latest_json:
        raise HTTPException(status_code=404, detail="В папке главы не найдено JSON файлов")

    try:
        raw_bytes = Path(latest_json).read_bytes()
        res = import_chapter_dialogue_payload(chapter_id, raw_bytes)
        return {"success": True, "file_path": latest_json, **res}
    except Exception as e:
        logger.error(f"Ошибка авто-импорта JSON: {e}")
        raise HTTPException(status_code=400, detail=str(e))
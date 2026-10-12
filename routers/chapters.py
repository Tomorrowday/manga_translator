# routers/chapters.py
# HTTP-контроллер для работы с главами

import os
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from database import db_session
from logger import logger
from services.chapter_service import (
    translate_entire_chapter_service,
    export_chapter_dialogue_payload,
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

        logger.info(f"Глава ID {chapter_id} и все её страницы/баблы полностью удалены из БД.")
        return {"success": True, "message": "Глава успешно удалена"}
    except Exception as e:
        logger.error(f"Ошибка при удалении главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/translate-all")
async def translate_entire_chapter(chapter_id: int):
    try:
        count = translate_entire_chapter_service(chapter_id)
        return {"success": True, "translated_blocks": count}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка перевода главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{chapter_id}/export-dialogue")
async def export_chapter_dialogue(chapter_id: int):
    try:
        json_content, filename = export_chapter_dialogue_payload(chapter_id)
        encoded_filename = quote(filename)

        return Response(
            content=json_content,
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
    try:
        res = export_chapter_dialogue_to_folder(chapter_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка сохранения скрипта в папку главы {chapter_id}: {e}")
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
    """
    Открывает нативный диалог выбора файла проводника Windows непосредственно
    в папке текущей главы (initialdir), после чего считывает и применяет выбранный JSON.
    """
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
            title="Выберите JSON скрипт перевода главы",
            initialdir=initial_dir,
            filetypes=[("JSON files", "*.json"), ("Text files", "*.txt"), ("All files", "*.*")]
        )
        root.destroy()
    except Exception as e:
        logger.warning(f"Не удалось открыть Tkinter диалог ({e}). Ищем последний JSON в папке.")

    if not selected_file:
        # Если пользователь нажал Отмена в диалоге
        return {"success": False, "cancelled": True}

    try:
        raw_bytes = Path(selected_file).read_bytes()
        res = import_chapter_dialogue_payload(chapter_id, raw_bytes)
        return {"success": True, "file_path": selected_file, **res}
    except Exception as e:
        logger.error(f"Ошибка парсинга выбранного файла {selected_file}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{chapter_id}/import-dialogue-from-folder")
async def import_dialogue_from_folder_endpoint(chapter_id: int):
    """
    Автоматически находит и импортирует самый свежий JSON скрипт из папки главы.
    """
    latest_json = find_latest_dialogue_json_in_folder(chapter_id)
    if not latest_json:
        raise HTTPException(status_code=404, detail="В папке текущей главы не найдено JSON файлов")

    try:
        raw_bytes = Path(latest_json).read_bytes()
        res = import_chapter_dialogue_payload(chapter_id, raw_bytes)
        return {"success": True, "file_path": latest_json, **res}
    except Exception as e:
        logger.error(f"Ошибка авто-импорта JSON из папки главы: {e}")
        raise HTTPException(status_code=400, detail=str(e))
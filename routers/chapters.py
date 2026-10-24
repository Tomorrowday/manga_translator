# routers/chapters.py
"""
Каркас роутера глав манги (удаление, экспорт/импорт скриптов, сброс шрифтов).
Реализация: routers/chapters_impl.py
Зависимости реализации: database.db_session, services.chapter_service, logger, tkinter, Path
"""

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import Response
import routers.chapters_impl as _impl

router = APIRouter(prefix="/api/chapters", tags=["Chapters"])


@router.delete("/{chapter_id}")
async def delete_chapter(chapter_id: int):
    """Удаляет главу и все связанные страницы и баблы."""
    return await _impl.delete_chapter(chapter_id)


@router.post("/{chapter_id}/reset-fonts")
async def reset_chapter_fonts(chapter_id: int):
    """Сбрасывает размеры всех баблов главы в Auto (font_size = NULL)."""
    return await _impl.reset_chapter_fonts(chapter_id)


@router.get("/{chapter_id}/export-dialogue")
async def export_chapter_dialogue(chapter_id: int) -> Response:
    """Скачивание чистого JSON файла диалогов в браузере."""
    return await _impl.export_chapter_dialogue(chapter_id)


@router.post("/{chapter_id}/export-dialogue-to-folder")
async def export_chapter_dialogue_to_folder_endpoint(chapter_id: int):
    """Сохраняет оба файла (_context.json и _dialogues.json) прямо в папку главы на диске."""
    return await _impl.export_chapter_dialogue_to_folder_endpoint(chapter_id)


@router.post("/{chapter_id}/import-dialogue")
async def import_chapter_dialogue(chapter_id: int, file: UploadFile = File(...)):
    """Импортирует JSON с переводом, переданный файлом через форму."""
    return await _impl.import_chapter_dialogue(chapter_id, file)


@router.post("/{chapter_id}/pick-and-import-dialogue")
async def pick_and_import_dialogue_endpoint(chapter_id: int):
    """Открывает системный диалог выбора JSON файла в папке главы."""
    return await _impl.pick_and_import_dialogue_endpoint(chapter_id)


@router.post("/{chapter_id}/import-dialogue-from-folder")
async def import_dialogue_from_folder_endpoint(chapter_id: int):
    """Автоматически находит последний JSON файл в папке главы и импортирует его."""
    return await _impl.import_dialogue_from_folder_endpoint(chapter_id)
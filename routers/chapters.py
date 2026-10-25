# routers/chapters.py
"""
Каркас роутера глав манги (удаление, экспорт/импорт скриптов, управление шрифтами, таймер и статистика).
Реализация: routers/chapters_impl.py
"""

from fastapi import APIRouter, UploadFile, File, Query
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


@router.post("/{chapter_id}/apply-font-size")
async def apply_chapter_font_size(chapter_id: int, font_size: int = Query(...)):
    """Применяет конкретный размер кегля ко всем баблам всех страниц главы."""
    return await _impl.apply_chapter_font_size(chapter_id, font_size)


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
    """Автоматически находит файл диалогов в папке главы или открывает выбор файла."""
    return await _impl.pick_and_import_dialogue_endpoint(chapter_id)


@router.post("/{chapter_id}/import-dialogue-from-folder")
async def import_dialogue_from_folder_endpoint(chapter_id: int):
    """Автоматически находит последний JSON файл диалогов в папке главы и импортирует его."""
    return await _impl.import_dialogue_from_folder_endpoint(chapter_id)


# ---- Таймер и подсчёт реплик/слов главы ----

@router.get("/{chapter_id}/timer/status")
async def get_chapter_timer_status(chapter_id: int):
    """Получить статус таймера главы и общее затраченное время."""
    return await _impl.get_chapter_timer_status(chapter_id)


@router.post("/{chapter_id}/timer/start")
async def start_chapter_timer(chapter_id: int):
    """Запустить таймер работы над текущей главой."""
    return await _impl.start_chapter_timer(chapter_id)


@router.post("/{chapter_id}/timer/stop")
async def stop_chapter_timer(chapter_id: int):
    """Остановить таймер работы над текущей главой и зафиксировать время."""
    return await _impl.stop_chapter_timer(chapter_id)


@router.post("/{chapter_id}/recalculate-stats")
async def recalculate_chapter_stats(chapter_id: int):
    """Принудительно пересчитать количество переведённых реплик и русских слов главы."""
    return await _impl.recalculate_chapter_stats(chapter_id)
# routers/projects.py
"""
Каркас роутера проектов манги (сканирование, настройки тайтлов, спикеры, глоссарий, статистика).
Реализация: routers/projects_impl.py
Зависимости реализации: database, schemas, config, ml.models, logger, pathlib
"""

from typing import Optional
from fastapi import APIRouter, Query

from schemas import (
    ScanProjectRequest,
    AddChapterRequest,
    GlossaryItemCreate,
    UpdateTitleSettingsRequest,
)
import routers.projects_impl as _impl

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.get("/global-settings")
async def get_global_settings_endpoint():
    """Получить глобальные настройки приложения."""
    return await _impl.get_global_settings_endpoint()


@router.put("/global-settings")
async def update_global_settings_endpoint(req: UpdateTitleSettingsRequest):
    """Обновить глобальные настройки приложения."""
    return await _impl.update_global_settings_endpoint(req)


@router.post("/scan")
async def scan_project(req: ScanProjectRequest):
    """Первичное сканирование корневой папки тайтла со всеми главами."""
    return await _impl.scan_project(req)


@router.post("/{title_id}/rescan")
async def rescan_project(title_id: int):
    """Повторное сканирование папки тайтла с добавлением новых глав."""
    return await _impl.rescan_project(title_id)


@router.post("/{title_id}/chapters")
async def add_chapters_to_title(title_id: int, req: AddChapterRequest):
    """Добавить отдельную главу в тайтл."""
    return await _impl.add_chapters_to_title(title_id, req)


@router.get("")
async def get_projects():
    """Получить список всех тайтлов."""
    return await _impl.get_projects()


@router.get("/detectors")
async def get_available_detectors_endpoint():
    """Список доступных моделей детекции (YOLO)."""
    return await _impl.get_available_detectors_endpoint()


@router.get("/cleaners")
async def get_available_cleaners_endpoint():
    """Список доступных моделей клина (LaMa)."""
    return await _impl.get_available_cleaners_endpoint()


@router.get("/{title_id}/tree")
async def get_project_tree(title_id: int):
    """Дерево проекта: главы, страницы и статусы."""
    return await _impl.get_project_tree(title_id)


@router.put("/{title_id}/settings")
async def update_title_settings(title_id: int, req: UpdateTitleSettingsRequest):
    """Обновить описание/синопсис и базовый размер шрифта тайтла."""
    return await _impl.update_title_settings(title_id, req)


@router.get("/{title_id}/speakers")
async def get_title_speakers(title_id: int, chapter_id: Optional[int] = Query(None)):
    """Список уникальных спикеров тайтла/главы."""
    return await _impl.get_title_speakers(title_id, chapter_id)


@router.delete("/{title_id}")
async def delete_project(title_id: int):
    """Удалить тайтл и все связанные данные из базы."""
    return await _impl.delete_project(title_id)


@router.get("/{title_id}/glossary")
async def get_glossary(title_id: int):
    """Получить термины глоссария тайтла."""
    return await _impl.get_glossary(title_id)


@router.post("/{title_id}/glossary")
async def add_glossary_item(title_id: int, req: GlossaryItemCreate):
    """Добавить новый термин или персонажа в глоссарий."""
    return await _impl.add_glossary_item(title_id, req)


@router.delete("/{title_id}/glossary/{entry_id}")
async def delete_glossary_item(title_id: int, entry_id: int):
    """Удалить термин из глоссария."""
    return await _impl.delete_glossary_item(title_id, entry_id)


@router.get("/{title_id}/stats")
async def get_project_stats(title_id: int):
    """Статистика проекта: количество глав, страниц и процент перевода."""
    return await _impl.get_project_stats(title_id)
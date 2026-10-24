# routers/pages.py
"""
Каркас роутера страниц манги (детекция, OCR, клин, баблы, запекание, отдача сканов).
Реализация: routers/pages_impl.py
Зависимости реализации: database, schemas, services.cleaner, services.page_service, cv2, numpy
"""

from typing import Optional
from fastapi import APIRouter, UploadFile, File, Query
from fastapi.responses import Response

from schemas import SavePageBlocksRequest, SpotCleanRequest
from schemas.blocks import BrushCleanRequest
import routers.pages_impl as _impl

router = APIRouter(prefix="/api/pages", tags=["Pages"])


@router.post("/release-vram")
async def release_vram_endpoint():
    """Принудительная очистка кэша видеопамяти."""
    return await _impl.release_vram_endpoint()


@router.get("/{page_id}")
async def get_page_details(page_id: int):
    """Информация о странице и путях к оригинальному и заклиненному сканам."""
    return await _impl.get_page_details(page_id)


@router.get("/{page_id}/speakers")
async def get_page_speakers(page_id: int):
    """Список спикеров тайтла и текущей главы для подсказок."""
    return await _impl.get_page_speakers(page_id)


@router.get("/{page_id}/image")
async def get_page_image(page_id: int) -> Response:
    """Отдача оригинального файла страницы манги."""
    return await _impl.get_page_image(page_id)


@router.get("/{page_id}/clean-image")
async def get_page_clean_image(page_id: int) -> Response:
    """Отдача заклиненного скана страницы (или оригинала, если клин отсутствует)."""
    return await _impl.get_page_clean_image(page_id)


@router.get("/{page_id}/blocks")
async def get_page_blocks(page_id: int):
    """Получение всех текстовых баблов страницы в порядке чтения."""
    return await _impl.get_page_blocks(page_id)


@router.post("/{page_id}/blocks")
@router.put("/{page_id}/blocks")
async def save_page_blocks_endpoint(page_id: int, req: SavePageBlocksRequest):
    """Сохранение/обновление всех баблов страницы."""
    return await _impl.save_page_blocks_endpoint(page_id, req)


@router.post("/{page_id}/detect")
async def detect_page_bubbles_by_id(
    page_id: int,
    conf: Optional[float] = Query(None),
    auto_oval: Optional[bool] = Query(None)
):
    """Запуск автодетекции баблов (YOLO) и распознавания текста (MangaOCR)."""
    return await _impl.detect_page_bubbles_by_id(page_id, conf, auto_oval)


@router.post("/{page_id}/clean")
async def clean_page_bubbles(page_id: int, mode: str = Query("auto")):
    """Пакетный клин всех размеченных баблов страницы (Auto / White / LaMa)."""
    return await _impl.clean_page_bubbles(page_id, mode)


@router.delete("/{page_id}/clean")
async def revert_page_clean(page_id: int):
    """Откат клина страницы к исходному скану."""
    return await _impl.revert_page_clean(page_id)


@router.post("/{page_id}/clean-spot")
async def spot_clean_page(page_id: int, req: SpotCleanRequest):
    """Точечная очистка выделенной области страницы (Spot Clean)."""
    return await _impl.spot_clean_page(page_id, req)


@router.post("/{page_id}/clean-brush")
async def brush_clean_page(page_id: int, req: BrushCleanRequest):
    """Очистка произвольного мазка кисти пользователя (LaMa / White / Black)."""
    return await _impl.brush_clean_page(page_id, req)


@router.post("/{page_id}/save-translated")
async def save_translated_page(page_id: int, file: UploadFile = File(...)):
    """Сохранение готовой запечённой страницы в папку translated."""
    return await _impl.save_translated_page(page_id, file)


@router.post("/{page_id}/open-folder")
async def open_translated_folder(page_id: int):
    """Открытие папки translated в Проводнике Windows."""
    return await _impl.open_translated_folder(page_id)
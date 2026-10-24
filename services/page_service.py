# services/page_service.py
"""
Каркас сервиса страницы: сохранение баблов, автодетект, клин и откат.
Реализация: services/page_service_impl.py
Зависимости реализации: os, time, uuid, pathlib, PIL, database, schemas.TextBlockItem,
                        services.cleaner, services.detector, services.ocr, logger
"""

from typing import List, Dict, Any, Tuple, Optional
from schemas import TextBlockItem
import services.page_service_impl as _impl


def get_active_global_settings() -> Dict[str, Any]:
    """Возвращает актуальные настройки приложения из таблицы global_settings."""
    return _impl.get_active_global_settings()


def save_page_blocks_service(page_id: int, blocks: List[TextBlockItem]) -> str:
    """Сохраняет баблы страницы, валидирует координаты и обновляет статус страницы."""
    return _impl.save_page_blocks_service(page_id, blocks)


def detect_page_bubbles_service(
    page_id: int,
    conf_override: Optional[float] = None,
    auto_oval_override: Optional[bool] = None
) -> Tuple[List[Dict[str, Any]], str, float]:
    """Запускает поиск баблов на странице с нуля через YOLO и распознает японский текст."""
    return _impl.detect_page_bubbles_service(page_id, conf_override, auto_oval_override)


def clean_page_bubbles_service(page_id: int, clean_mode: str = "auto") -> Tuple[str, str, Dict[str, int]]:
    """Выполняет пакетный клин всех размеченных баблов страницы (Auto / White / LaMa)."""
    return _impl.clean_page_bubbles_service(page_id, clean_mode)


def revert_page_clean_service(page_id: int) -> str:
    """Откатывает клин страницы, удаляет файл cleaned и возвращает исходный скан."""
    return _impl.revert_page_clean_service(page_id)
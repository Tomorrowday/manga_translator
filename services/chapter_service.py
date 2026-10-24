# services/chapter_service.py
"""
Каркас сервиса глав манги: экспорт в JSON-скрипты и импорт переводов со спикерами.
Реализация: services/chapter_service_impl.py
Зависимости реализации: os, json, re, pathlib, database, services.prompts, logger
"""

from typing import Dict, Any, Tuple, Optional
import services.chapter_service_impl as _impl


def build_chapter_export_payloads(chapter_id: int) -> Tuple[str, str, str, str, Optional[str]]:
    """Собирает JSON контекста (_context.json) и JSON реплик (_dialogues.json) для главы."""
    return _impl.build_chapter_export_payloads(chapter_id)


def export_chapter_dialogue_to_folder(chapter_id: int) -> Dict[str, Any]:
    """Сохраняет оба JSON-файла напрямую в локальную папку главы на диске."""
    return _impl.export_chapter_dialogue_to_folder(chapter_id)


def get_chapter_folder_path(chapter_id: int) -> Optional[str]:
    """Определяет физический путь к папке главы на диске."""
    return _impl.get_chapter_folder_path(chapter_id)


def find_latest_dialogue_json_in_folder(chapter_id: int) -> Optional[str]:
    """Ищет последний измененный JSON файл с диалогами в папке главы."""
    return _impl.find_latest_dialogue_json_in_folder(chapter_id)


def import_chapter_dialogue_payload(chapter_id: int, file_bytes: bytes) -> Dict[str, int]:
    """Импортирует готовый JSON-перевод, обновляя русские реплики, спикеров и форму баблов."""
    return _impl.import_chapter_dialogue_payload(chapter_id, file_bytes)
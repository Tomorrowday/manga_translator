# services/translator.py
"""
Каркас сервиса перевода текста манги (Gemini API, санитизация и разбор реплик).
Реализация: services/translator_impl.py
Зависимости реализации: re, ml.models (ml), schemas.BatchTranslateItem, logger, services.prompts
"""

from typing import List, Dict, Any, Optional
from schemas import BatchTranslateItem
import services.translator_impl as _impl


def sanitize_translation(text: str) -> str:
    """Удаляет артефакты ответа LLM: префиксы спикеров, скобки и внешние кавычки."""
    return _impl.sanitize_translation(text)


def translate_single_text(text: str, title_description: str = "") -> str:
    """Перевод одиночной реплики через Gemini."""
    return _impl.translate_single_text(text, title_description)


def translate_batch_items(
    items: List[BatchTranslateItem],
    title_description: str = "",
    glossary_rows: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, str]:
    """Пакетный перевод реплик одной страницы."""
    return _impl.translate_batch_items(items, title_description, glossary_rows)


def translate_chapter_dialogues(
    chapter_dialogue: List[Dict[str, Any]],
    glossary_rows: List[Dict[str, Any]],
    title_description: str = ""
) -> Dict[str, str]:
    """Сквозной перевод всех реплик главы манги."""
    return _impl.translate_chapter_dialogues(chapter_dialogue, glossary_rows, title_description)
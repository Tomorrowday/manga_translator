# services/prompts.py
"""
Каркас системных промптов и инструкций для LLM (Gemini, Claude, ChatGPT, Ollama).
Реализация: services/prompts_impl.py
Зависимости реализации: typing
"""

from typing import List, Dict, Any, Optional
import services.prompts_impl as _impl

# Реэкспорт неизменяемой системной инструкции для JSON-экспорта
CLAUDE_CHATGPT_EXPORT_INSTRUCTIONS: str = _impl.CLAUDE_CHATGPT_EXPORT_INSTRUCTIONS


def format_glossary_line(g: Dict[str, Any]) -> str:
    """Форматирует строку глоссария с учетом наличия японского оригинала."""
    return _impl.format_glossary_line(g)


def build_single_translate_prompt(text: str, title_description: str = "") -> str:
    """Формирует промпт для одиночного перевода фразы."""
    return _impl.build_single_translate_prompt(text, title_description)


def build_page_batch_prompt(
    dialogue_text: str,
    title_description: str = "",
    glossary_rows: Optional[List[Dict[str, Any]]] = None
) -> str:
    """Формирует промпт для пакетного перевода диалогов страницы с глоссарием и синопсисом."""
    return _impl.build_page_batch_prompt(dialogue_text, title_description, glossary_rows)


def build_chapter_batch_prompt(
    full_text: str,
    title_description: str = "",
    glossary_rows: Optional[List[Dict[str, Any]]] = None
) -> str:
    """Формирует промпт для сквозного перевода всех диалогов главы манги."""
    return _impl.build_chapter_batch_prompt(full_text, title_description, glossary_rows)
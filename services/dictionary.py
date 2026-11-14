# services/dictionary.py
"""
Каркас сервиса локального японско-русского словаря и морфологического анализатора.
Реализация: services/dictionary_impl.py (пакет services/dictionary_ops/)
Зависимости реализации: sqlite3, models GiNZA/SudachiPy (опционально), database.get_db
"""

from typing import Dict, Any, List, Optional
import services.dictionary_impl as _impl

dict_engine = _impl.dict_engine


def analyze_bubble_text(
    jap_text: str,
    title_id: Optional[int] = None,
    nlp_mode: str = "auto",
) -> List[Dict[str, Any]]:
    """Токенизирует японскую фразу бабла, выделяет термины глоссария и статьи из Warodai/JMdict."""
    return _impl.dict_engine.analyze_bubble(jap_text, title_id=title_id, nlp_mode=nlp_mode)


def invalidate_glossary_cache(title_id: Optional[int] = None) -> None:
    """Сбрасывает кэш автомата Ахо-Корасик для указанного тайтла."""
    _impl.dict_engine.invalidate_glossary_cache(title_id)


def get_dictionary_status() -> Dict[str, Any]:
    """Возвращает статистику базы словаря data/jp_dict.sqlite и активный NLP-бэкенд."""
    status = _impl.get_dictionary_status()
    status["nlp"] = _impl.dict_engine.get_nlp_info()
    return status


def download_and_build_dictionaries(
    sources: Optional[List[str]] = None,
    force_download: bool = False,
) -> Dict[str, Any]:
    """Скачивает архивы Yomitan (Warodai, JMdict RU) и индексирует их в data/jp_dict.sqlite."""
    return _impl.download_and_build_dictionaries(sources=sources, force_download=force_download)

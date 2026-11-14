# services/dictionary_ops/__init__.py
# Пакет операций локального японско-русского словаря и морфологического анализатора

from services.dictionary_ops.analyzer import (
    MangaDictionaryEngine,
    dict_engine,
    DictSense,
    GlossaryHit,
    TokenSpanOut,
)
from services.dictionary_ops.db_builder import (
    ensure_jp_dict_schema,
    import_yomitan_zip,
    get_dictionary_status,
    download_and_build_dictionaries,
)
from services.dictionary_ops.deinflector import (
    DEINFLECT_RULES,
    POS_MAP_RU,
    kata_to_hira,
    collapse_manga_emphasis,
    deinflect_candidates,
)

__all__ = [
    "MangaDictionaryEngine",
    "dict_engine",
    "DictSense",
    "GlossaryHit",
    "TokenSpanOut",
    "ensure_jp_dict_schema",
    "import_yomitan_zip",
    "get_dictionary_status",
    "download_and_build_dictionaries",
    "DEINFLECT_RULES",
    "POS_MAP_RU",
    "kata_to_hira",
    "collapse_manga_emphasis",
    "deinflect_candidates",
]

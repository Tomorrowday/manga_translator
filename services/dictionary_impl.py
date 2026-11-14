# services/dictionary_impl.py
# Ре-экспорт операций локального японско-русского словаря из пакета services/dictionary_ops/

from services.dictionary_ops import (
    MangaDictionaryEngine,
    dict_engine,
    ensure_jp_dict_schema,
    import_yomitan_zip,
    get_dictionary_status,
    download_and_build_dictionaries,
)

__all__ = [
    "MangaDictionaryEngine",
    "dict_engine",
    "ensure_jp_dict_schema",
    "import_yomitan_zip",
    "get_dictionary_status",
    "download_and_build_dictionaries",
]

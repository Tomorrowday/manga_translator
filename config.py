# config.py
"""
Каркас конфигурации приложения и системных путей.
Реализация: config_impl.py
Зависимости реализации: os, re, warnings, logging, pathlib, dotenv
"""

from pathlib import Path
from typing import Dict, List
import config_impl as _impl

# Базовые пути проекта
BASE_DIR: Path = _impl.BASE_DIR
DATA_DIR: Path = _impl.DATA_DIR
DB_PATH: Path = _impl.DB_PATH
JP_DICT_DB_PATH: Path = _impl.JP_DICT_DB_PATH
DICT_SOURCES_DIR: Path = _impl.DICT_SOURCES_DIR
WEIGHTS_DIR: Path = _impl.WEIGHTS_DIR
CACHE_DIR: Path = _impl.CACHE_DIR
DETECT_MODELS_DIR: Path = _impl.DETECT_MODELS_DIR
CLEAN_MODELS_DIR: Path = _impl.CLEAN_MODELS_DIR
YOLO_WEIGHTS_PATH: Path = _impl.YOLO_WEIGHTS_PATH

# Настройки клина
LAMA_FORCE_GRAYSCALE: bool = _impl.LAMA_FORCE_GRAYSCALE
MAX_LAMA_DIM: int = _impl.MAX_LAMA_DIM


def get_available_detectors() -> Dict[str, str]:
    """Сканирует директории весов и возвращает список доступных YOLO-моделей."""
    return _impl.get_available_detectors()


def get_available_cleaners() -> Dict[str, str]:
    """Сканирует директории весов и возвращает список доступных Inpainting-моделей (LaMa)."""
    return _impl.get_available_cleaners()


def natural_sort_key(s: str) -> List[object]:
    """Ключ натуральной сортировки строк с числами (например, 'Page 2' перед 'Page 10')."""
    return _impl.natural_sort_key(s)
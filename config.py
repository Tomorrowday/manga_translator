# config.py
# Глобальная конфигурация путей, моделей и окружения

import os
import re
import warnings
import logging
from pathlib import Path
from typing import Dict
from dotenv import load_dotenv

# 1. Подавление лишнего шума и предупреждений от библиотек
warnings.filterwarnings("ignore")
os.environ["TRANSFORMERS_VERBOSITY"] = "error"
os.environ["TQDM_DISABLE"] = "1"
os.environ["YOLO_VERBOSE"] = "False"
os.environ["ULTRALYTICS_AUTOINSTALL"] = "False"
logging.getLogger("transformers").setLevel(logging.ERROR)
logging.getLogger("ultralytics").setLevel(logging.ERROR)

# Настройка аллокатора PyTorch CUDA строго ДО загрузки torch/нейросетей
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True,max_split_size_mb:128")

# Загружаем переменные из .env
load_dotenv()

# Базовые пути проекта
BASE_DIR = Path(__file__).resolve().parent

# 1. Папка для баз данных SQLite и бэкапов
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "manga_db.sqlite"

# 2. Папка для весов нейросетей (.pt, .onnx, чекпоинты)
WEIGHTS_DIR = BASE_DIR / "weights"
WEIGHTS_DIR.mkdir(exist_ok=True)

# Локальный кэш моделей (чтобы MangaOCR и Torch не качали ничего на диск C:)
CACHE_DIR = WEIGHTS_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)
os.environ["HF_HOME"] = str(CACHE_DIR / "huggingface")
os.environ["TORCH_HOME"] = str(CACHE_DIR / "torch")

# Оффлайн-режим для huggingface/transformers
os.environ["TRANSFORMERS_OFFLINE"] = "0"
os.environ["HF_HUB_OFFLINE"] = "0"

# Папки специализированных моделей детекции баблов и моделей клина (LaMa)
DETECT_MODELS_DIR = WEIGHTS_DIR / "detect-bubble"
DETECT_MODELS_DIR.mkdir(parents=True, exist_ok=True)

CLEAN_MODELS_DIR = WEIGHTS_DIR / "clean-lama"
CLEAN_MODELS_DIR.mkdir(parents=True, exist_ok=True)

YOLO_WEIGHTS_PATH = WEIGHTS_DIR / "yolo_manga.pt"
if not YOLO_WEIGHTS_PATH.exists() and (BASE_DIR / "yolo_manga.pt").exists():
    YOLO_WEIGHTS_PATH = BASE_DIR / "yolo_manga.pt"

if not DB_PATH.exists() and (BASE_DIR / "manga_db.sqlite").exists():
    DB_PATH = BASE_DIR / "manga_db.sqlite"


def get_available_detectors() -> Dict[str, str]:
    """Сканирует папку weights/detect-bubble/*.pt и weights/*.pt."""
    detectors: Dict[str, str] = {}
    bubble_pt_files = sorted(list(DETECT_MODELS_DIR.glob("*.pt")), key=lambda p: p.name.lower())
    for f in bubble_pt_files:
        detectors[f.name] = f.name

    if not detectors:
        root_weights_pt = sorted(list(WEIGHTS_DIR.glob("*.pt")), key=lambda p: p.name.lower())
        for f in root_weights_pt:
            if "lama" not in f.name.lower() and "generator" not in f.name.lower():
                detectors[f.name] = f.name

    if not detectors:
        detectors["yolo_manga.pt"] = "yolo_manga.pt"

    return detectors


def get_available_cleaners() -> Dict[str, str]:
    """Сканирует папку weights/clean-lama/*.pt для выбора модели Inpainting."""
    cleaners: Dict[str, str] = {}

    # Всегда предоставляем опцию стандартной библиотеки SimpleLama
    cleaners["simple_lama"] = "SimpleLama (Библиотека)"

    lama_files = sorted(list(CLEAN_MODELS_DIR.glob("*.pt")), key=lambda p: p.name.lower())
    for f in lama_files:
        cleaners[f.name] = f.name

    # Поиск чекпоинтов LaMa в корне weights/
    root_lama = sorted(list(WEIGHTS_DIR.glob("*lama*.pt")), key=lambda p: p.name.lower())
    for f in root_lama:
        if f.name not in cleaners:
            cleaners[f.name] = f.name

    return cleaners


# Настройки клина
LAMA_FORCE_GRAYSCALE = os.getenv("LAMA_FORCE_GRAYSCALE", "false").lower() in ("true", "1", "yes")
MAX_LAMA_DIM = int(os.getenv("MAX_LAMA_DIM", "2048"))


def natural_sort_key(s: str):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]
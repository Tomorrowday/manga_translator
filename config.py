# config.py
# Глобальная конфигурация путей, моделей и окружения

import os
import re
from pathlib import Path
from typing import Dict
from dotenv import load_dotenv

# Настройка аллокатора PyTorch CUDA строго ДО загрузки torch/нейросетей
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True,max_split_size_mb:128")

# Загружаем переменные из .env
load_dotenv()

# Оффлайн-режим для huggingface/transformers и отключение телеметрии
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["YOLO_VERBOSE"] = "False"
os.environ["ULTRALYTICS_AUTOINSTALL"] = "False"

# Базовые пути
BASE_DIR = Path(__file__).resolve().parent

# 1. Папка для баз данных SQLite и бэкапов
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "manga_db.sqlite"

# 2. Папка для весов нейросетей (.pt, .onnx, чекпоинты)
WEIGHTS_DIR = BASE_DIR / "weights"
WEIGHTS_DIR.mkdir(exist_ok=True)

# Папка специализированных моделей детекции баблов и текста
DETECT_MODELS_DIR = WEIGHTS_DIR / "detect-bubble"
DETECT_MODELS_DIR.mkdir(parents=True, exist_ok=True)

YOLO_WEIGHTS_PATH = WEIGHTS_DIR / "yolo_manga.pt"
if not YOLO_WEIGHTS_PATH.exists() and (BASE_DIR / "yolo_manga.pt").exists():
    YOLO_WEIGHTS_PATH = BASE_DIR / "yolo_manga.pt"

if not DB_PATH.exists() and (BASE_DIR / "manga_db.sqlite").exists():
    DB_PATH = BASE_DIR / "manga_db.sqlite"


def get_available_detectors() -> Dict[str, str]:
    """
    Динамически сканирует папку weights/detect-bubble/*.pt.
    Если там пусто — проверяет weights/*.pt.
    Возвращает словарь вида {"имя_файла.pt": "имя_файла.pt"}.
    """
    detectors: Dict[str, str] = {}

    # 1. Приоритетный поиск в папке weights/detect-bubble/
    bubble_pt_files = sorted(list(DETECT_MODELS_DIR.glob("*.pt")), key=lambda p: p.name.lower())
    for f in bubble_pt_files:
        detectors[f.name] = f.name

    # 2. Если в папке detect-bubble ничего нет, ищем в weights/
    if not detectors:
        root_weights_pt = sorted(list(WEIGHTS_DIR.glob("*.pt")), key=lambda p: p.name.lower())
        for f in root_weights_pt:
            # Исключаем чекпоинты LaMa, чтобы не путать с детекторами
            if "lama" not in f.name.lower() and "generator" not in f.name.lower():
                detectors[f.name] = f.name

    # 3. Fallback, если вообще ни одного файла не обнаружено
    if not detectors:
        detectors["yolo_manga.pt"] = "yolo_manga.pt"

    return detectors


# API-ключи и конфигурация LLM
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL_NAME = "gemini-3.5-flash-lite"

# =====================================================================
# НАСТРОЙКИ КЛИНА И INPAINTING (LAMA)
# =====================================================================
LAMA_FORCE_GRAYSCALE = os.getenv("LAMA_FORCE_GRAYSCALE", "false").lower() in ("true", "1", "yes")
MAX_LAMA_DIM = int(os.getenv("MAX_LAMA_DIM", "2048"))


def natural_sort_key(s: str):
    """
    Ключ для естественной сортировки строк с числами.
    Благодаря этому 'page_2' идёт перед 'page_10'.
    """
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]
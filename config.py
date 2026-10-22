# config.py
# Глобальная конфигурация путей, моделей и окружения

import os
import re
from pathlib import Path
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
YOLO_WEIGHTS_PATH = WEIGHTS_DIR / "yolo_manga.pt"

# Плавный fallback: если файл еще не успели переместить из корня
if not YOLO_WEIGHTS_PATH.exists() and (BASE_DIR / "yolo_manga.pt").exists():
    YOLO_WEIGHTS_PATH = BASE_DIR / "yolo_manga.pt"

if not DB_PATH.exists() and (BASE_DIR / "manga_db.sqlite").exists():
    DB_PATH = BASE_DIR / "manga_db.sqlite"

# Доступные для выбора модели YOLO детекции баблов/текста
AVAILABLE_DETECTORS = {
    "yolo_manga.pt": "YOLOv8 Bubble Detector (Default)",
    "yolo26s.pt": "YOLO26s Manga Detector (New)",
}

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
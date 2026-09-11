import os
import re
from pathlib import Path
from dotenv import load_dotenv

# Загружаем переменные из .env
load_dotenv()

# Оффлайн-режим для huggingface/transformers
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"

# Базовые пути
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "manga_db.sqlite"
YOLO_WEIGHTS_PATH = BASE_DIR / "yolo_manga.pt"

# API-ключи
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL_NAME = "gemini-3.5-flash-lite"


def natural_sort_key(s: str):
    """
    Ключ для естественной сортировки строк с числами.
    Благодаря этому 'page_2' идёт перед 'page_10'.
    """
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]
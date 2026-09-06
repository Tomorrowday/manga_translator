import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем переменные из .env
load_dotenv()

# Оффлайн-режим для huggingface/transformers (чтобы не лезли в сеть при старте)
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"

# Базовые пути
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "manga_db.sqlite"
YOLO_WEIGHTS_PATH = BASE_DIR / "yolo_manga.pt"

# API-ключи
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
#Не изменяй её название
GEMINI_MODEL_NAME = "gemini-3.5-flash-lite"
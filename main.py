# main.py
# Точка входа FastAPI бэкенда с чистым выводом в консоль

import config  # <-- ОБЯЗАТЕЛЬНО ПЕРВОЙ СТРОЧКОЙ! Задаёт HF_HOME и TORCH_HOME внутри папки проекта
from contextlib import asynccontextmanager
from typing import Any, cast
import warnings
import logging
from fastapi import FastAPI
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
import pillow_heif

# Отключаем предупреждения при старте
warnings.filterwarnings("ignore")
logging.getLogger("transformers").setLevel(logging.ERROR)
logging.getLogger("ultralytics").setLevel(logging.ERROR)

import database
from ml.models import load_ml_models
from routers import ai, projects, pages, chapters

# Регистрация поддержки форматов AVIF и HEIF в Pillow
pillow_heif.register_heif_opener()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Инициализация базы данных и загрузка ML-моделей при старте приложения."""
    print("\n" + "=" * 50)
    print("  Manga Translator Backend (FastAPI)")
    print("=" * 50)

    database.init_db()
    print("[1/3] База данных SQLite подключена.")

    load_ml_models()
    print("[2/3] Модели MangaOCR и YOLO загружены.")
    print("[3/3] Модуль LaMa Inpainting готов к работе.")
    print("🚀 Сервер успешно запущен: http://127.0.0.1:8000")
    print("=" * 50 + "\n")
    yield


middleware = [
    Middleware(
        cast(Any, CORSMiddleware),
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
]

app = FastAPI(
    title="Manga Translator BFF",
    description="Локальный бэкенд для детекции, распознавания и перевода манги",
    version="2.0.0",
    lifespan=lifespan,
    middleware=middleware,
)

# Подключение роутеров API
app.include_router(ai.router)
app.include_router(projects.router)
app.include_router(pages.router)
app.include_router(chapters.router)


# В main.py добавить фильтр логов для uvicorn.access:
class IgnoreExternalPollsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "/health" not in msg and "/v1/models" not in msg

logging.getLogger("uvicorn.access").addFilter(IgnoreExternalPollsFilter())


@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Manga Translator BFF"}


@app.get("/v1/models")
def openai_models_stub():
    """Заглушка для внешних AI-расширений (Kilo Code и др.), опрашивающих порт 8000."""
    return {"object": "list", "data": []}
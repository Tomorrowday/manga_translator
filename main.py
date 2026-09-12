# main.py
# Точка входа FastAPI бэкенда

from contextlib import asynccontextmanager
from typing import Any, cast
from fastapi import FastAPI
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

import database
from ml.models import load_ml_models
from routers import ai, projects, pages, chapters


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Инициализация базы данных и загрузка ML-моделей при старте приложения."""
    database.init_db()
    load_ml_models()
    print("🚀 Manga Translator BFF готов к обработке запросов!")
    yield


# Настройка CORS через официальный контейнер Starlette Middleware
# noinspection PyTypeChecker
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


@app.get("/")
def health_check():
    return {"status": "ok", "service": "Manga Translator BFF"}
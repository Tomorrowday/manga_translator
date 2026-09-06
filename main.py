from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
from ml.models import load_ml_models
from routers import ai, projects, pages


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление жизненным циклом приложения при старте и остановке."""
    # 1. Инициализация структуры таблиц БД
    database.init_db()

    # 2. Загрузка весов нейросетей в видеопамять (GPU)
    load_ml_models()

    print("🚀 Manga Translator BFF готов к обработке запросов!")
    yield


app = FastAPI(
    title="Manga Translator BFF",
    description="Локальный бэкенд для детекции, распознавания и перевода манги",
    version="2.0.0",
    lifespan=lifespan
)

# Настройка CORS для работы с Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(ai.router)
app.include_router(projects.router)
app.include_router(pages.router)


@app.get("/")
def health_check():
    """Проверка доступности сервера."""
    return {"status": "ok", "service": "Manga Translator BFF"}
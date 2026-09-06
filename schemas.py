from pydantic import BaseModel
from typing import List, Dict, Optional


class TranslationRequest(BaseModel):
    """Одиночный запрос на перевод реплики"""
    text: str
    context: str = ""
    glossary: Dict[str, str] = {}


class BatchTranslateItem(BaseModel):
    id: str
    text: str
    speaker: Optional[str] = ""        # Кто произносит реплику (если известно)
    order_index: Optional[int] = 0     # Порядковый номер бабла на странице


class BatchTranslationRequest(BaseModel):
    """Пакетный перевод реплик всей страницы"""
    items: List[BatchTranslateItem]
    context: str = ""                  # Описание сцены / предыдущие события


class ScanProjectRequest(BaseModel):
    """Запрос на добавление локальной папки тайтла"""
    name: str
    folder_path: str


class TextBlockItem(BaseModel):
    """Модель отдельного бабла с координатами и текстом"""
    id: str
    x: float
    y: float
    width: float
    height: float
    jap_text: str = ""
    rus_text: str = ""
    speaker: str = ""  # Имя персонажа
    order_index: int = 0  # Порядковый номер чтения
    status: str = "new"


class SavePageBlocksRequest(BaseModel):
    """Список баблов для сохранения на странице"""
    blocks: List[TextBlockItem]
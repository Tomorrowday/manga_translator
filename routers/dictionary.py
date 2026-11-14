# routers/dictionary.py
"""
Каркас роутера локального японско-русского словаря (морфологический разбор баблов,
каскадный поиск Warodai/JMdict, авто-сборка базы и добавление в глоссарий тайтла в 1 клик).
Реализация: routers/dictionary_impl.py
Зависимости реализации: fastapi, schemas.dictionary, services.dictionary
"""

from fastapi import APIRouter
from schemas.dictionary import (
    DictAnalyzeRequest,
    DictLookupRequest,
    DictGlossaryUpsertRequest,
    DictBuildRequest,
)
import routers.dictionary_impl as _impl

router = APIRouter(prefix="/api/dictionary", tags=["Dictionary"])


@router.get("/status")
def get_dict_status():
    """Статус локальной базы словаря data/jp_dict.sqlite и активного NLP-движка."""
    return _impl.get_dict_status_endpoint()


@router.post("/build")
def build_dictionary(req: DictBuildRequest):
    """Скачивает релизные архивы Warodai и JMdict RU и индексирует их в data/jp_dict.sqlite."""
    return _impl.build_dict_endpoint(req)


@router.post("/analyze")
def analyze_bubble(req: DictAnalyzeRequest):
    """Токенизирует японский текст бабла со склейкой предикатов, глоссарием и словарными статьями."""
    return _impl.analyze_bubble_endpoint(req)


@router.post("/lookup")
def lookup_word(req: DictLookupRequest):
    """Прямой поиск отдельного слова/формы в словаре."""
    return _impl.lookup_word_endpoint(req)


@router.post("/glossary")
def upsert_glossary_term(req: DictGlossaryUpsertRequest):
    """Мгновенное добавление или обновление термина в глоссарии тайтла из карточки словаря."""
    return _impl.upsert_glossary_from_dict_endpoint(req)

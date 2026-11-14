# schemas/dictionary.py
# Контракты запросов локального японско-русского словаря и морфологического анализатора

from pydantic import BaseModel
from typing import List, Optional


class DictAnalyzeRequest(BaseModel):
    title_id: Optional[int] = None
    jap_text: str
    nlp_mode: Optional[str] = "auto"  # "auto" | "bert_large" | "electra" | "sudachi"


class DictLookupRequest(BaseModel):
    title_id: Optional[int] = None
    query: str


class DictGlossaryUpsertRequest(BaseModel):
    title_id: int
    jap_word: str
    rus_word: str
    context: Optional[str] = ""


class DictBuildRequest(BaseModel):
    sources: Optional[List[str]] = None  # ["jmdict_ru", "warodai"]
    force_rebuild: Optional[bool] = False

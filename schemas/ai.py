from pydantic import BaseModel
from typing import List, Dict, Optional


class OcrRequest(BaseModel):
    page_id: int
    x: float
    y: float
    width: float
    height: float
    rotation: Optional[float] = 0.0


class TranslationRequest(BaseModel):
    text: str
    context: str = ""
    glossary: Dict[str, str] = {}
    title_description: Optional[str] = ""


class BatchTranslateItem(BaseModel):
    id: str
    text: str
    speaker: Optional[str] = ""
    order_index: Optional[int] = 0


class BatchTranslationRequest(BaseModel):
    items: List[BatchTranslateItem]
    context: str = ""
    page_id: Optional[int] = None
    title_description: Optional[str] = ""
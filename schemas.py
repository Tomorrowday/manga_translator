from pydantic import BaseModel
from typing import List, Dict, Optional


class OcrRequest(BaseModel):
    page_id: int
    x: float
    y: float
    width: float
    height: float
    rotation: Optional[float] = 0.0


class SpotCleanRequest(BaseModel):
    x: float
    y: float
    width: float
    height: float
    method: Optional[str] = "auto"  # "auto" | "lama" | "white"


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


class ScanProjectRequest(BaseModel):
    name: str
    folder_path: str


class AddChapterRequest(BaseModel):
    folder_path: str
    chapter_number: Optional[str] = ""


class UpdateTitleDescriptionRequest(BaseModel):
    description: str


class GlossaryItemCreate(BaseModel):
    jap_word: Optional[str] = ""
    rus_word: str
    context: Optional[str] = ""


class TextBlockItem(BaseModel):
    id: str
    x: float
    y: float
    width: float
    height: float
    rotation: Optional[float] = 0.0
    jap_text: str = ""
    rus_text: str = ""
    speaker: str = ""
    order_index: int = 0
    font_size: Optional[int] = None
    font_family: Optional[str] = "v_CCFaceFront"
    is_bold: Optional[bool] = False
    is_italic: Optional[bool] = False
    is_uppercase: Optional[bool] = False
    has_stroke: Optional[bool] = False
    shape: Optional[str] = "rect"
    padding_mode: Optional[str] = "safe"
    status: str = "new"


class SavePageBlocksRequest(BaseModel):
    blocks: List[TextBlockItem]
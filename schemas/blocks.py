# schemas/blocks.py
from pydantic import BaseModel
from typing import List, Optional


class BrushCleanRequest(BaseModel):
    mask_base64: str  # PNG-маска в data:image/png;base64,... или сырой base64


class SpotCleanRequest(BaseModel):
    x: float
    y: float
    width: float
    height: float
    rotation: Optional[float] = 0.0
    shape: Optional[str] = "rect"
    method: Optional[str] = "auto"  # "auto" | "lama" | "white"


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
    min_hyphens: Optional[bool] = True
    status: str = "new"


class SavePageBlocksRequest(BaseModel):
    blocks: List[TextBlockItem]
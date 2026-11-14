# schemas/projects.py
from pydantic import BaseModel
from typing import Optional


class ScanProjectRequest(BaseModel):
    name: str
    folder_path: str


class AddChapterRequest(BaseModel):
    folder_path: str
    chapter_number: Optional[str] = ""


class UpdateTitleSettingsRequest(BaseModel):
    description: Optional[str] = None
    default_font_size: Optional[int] = None
    detector_model: Optional[str] = None
    clean_model: Optional[str] = None
    detect_conf: Optional[float] = None
    auto_oval_bubble: Optional[bool] = None
    default_padding: Optional[str] = None
    default_hyphenation: Optional[bool] = None
    font_bubble: Optional[str] = None
    font_thought: Optional[str] = None
    font_sfx: Optional[str] = None
    lama_downscale: Optional[bool] = None
    show_sfx: Optional[bool] = None
    dict_nlp_mode: Optional[str] = None


class GlossaryItemCreate(BaseModel):
    jap_word: Optional[str] = ""
    rus_word: str
    context: Optional[str] = ""
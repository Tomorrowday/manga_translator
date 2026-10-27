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
    detector_model: Optional[str] = "yolo_manga.pt"
    clean_model: Optional[str] = "anime-manga-big-lama.pt"
    detect_conf: Optional[float] = 0.25
    auto_oval_bubble: Optional[bool] = True
    default_padding: Optional[str] = "safe"
    default_hyphenation: Optional[bool] = True
    font_bubble: Optional[str] = "v_CCFaceFront"
    font_thought: Optional[str] = "v_CCFaceFront"
    font_sfx: Optional[str] = "v_Mighty Zeo 2.0"
    lama_downscale: Optional[bool] = False
    show_sfx: Optional[bool] = False


class GlossaryItemCreate(BaseModel):
    jap_word: Optional[str] = ""
    rus_word: str
    context: Optional[str] = ""
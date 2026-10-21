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
    description: Optional[str] = ""
    default_font_size: Optional[int] = 14


class GlossaryItemCreate(BaseModel):
    jap_word: Optional[str] = ""
    rus_word: str
    context: Optional[str] = ""
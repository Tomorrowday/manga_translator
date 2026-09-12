from pydantic import BaseModel
from typing import Optional


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
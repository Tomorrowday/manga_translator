# schemas/__init__.py
from .ai import (
    OcrRequest,
    TranslationRequest,
    BatchTranslateItem,
    BatchTranslationRequest,
)
from .blocks import (
    BrushCleanRequest,
    SpotCleanRequest,
    TextBlockItem,
    SavePageBlocksRequest,
)
from .projects import (
    ScanProjectRequest,
    AddChapterRequest,
    UpdateTitleSettingsRequest,
    GlossaryItemCreate,
)

__all__ = [
    "OcrRequest",
    "TranslationRequest",
    "BatchTranslateItem",
    "BatchTranslationRequest",
    "BrushCleanRequest",
    "SpotCleanRequest",
    "TextBlockItem",
    "SavePageBlocksRequest",
    "ScanProjectRequest",
    "AddChapterRequest",
    "UpdateTitleSettingsRequest",
    "GlossaryItemCreate",
]
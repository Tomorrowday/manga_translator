from .ai import (
    OcrRequest,
    TranslationRequest,
    BatchTranslateItem,
    BatchTranslationRequest,
)
from .blocks import (
    SpotCleanRequest,
    TextBlockItem,
    SavePageBlocksRequest,
)
from .projects import (
    ScanProjectRequest,
    AddChapterRequest,
    UpdateTitleDescriptionRequest,
    UpdateTitleSettingsRequest,
    GlossaryItemCreate,
)

__all__ = [
    "OcrRequest",
    "TranslationRequest",
    "BatchTranslateItem",
    "BatchTranslationRequest",
    "SpotCleanRequest",
    "TextBlockItem",
    "SavePageBlocksRequest",
    "ScanProjectRequest",
    "AddChapterRequest",
    "UpdateTitleDescriptionRequest",
    "UpdateTitleSettingsRequest",
    "GlossaryItemCreate",
]
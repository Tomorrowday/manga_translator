from fastapi import HTTPException
import services.chapter_service as chapter_service
from logger import logger


def reset_chapter_fonts(chapter_id: int):
    try:
        updated_count = chapter_service.apply_font_size_to_chapter_service(chapter_id, None)
        return {"success": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Ошибка сброса шрифтов главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def apply_chapter_font_size(chapter_id: int, font_size: int):
    try:
        updated_count = chapter_service.apply_font_size_to_chapter_service(chapter_id, font_size)
        return {"success": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Ошибка установки кегля для главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

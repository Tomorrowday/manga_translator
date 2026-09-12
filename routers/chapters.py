# routers/chapters.py
# HTTP-контроллер для работы с главами

from urllib.parse import quote
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from database import db_session
from logger import logger
from services.chapter_service import (
    translate_entire_chapter_service,
    export_chapter_dialogue_payload,
    import_chapter_dialogue_payload,
)

router = APIRouter(prefix="/api/chapters", tags=["Chapters"])


@router.delete("/{chapter_id}")
async def delete_chapter(chapter_id: int):
    """
    Удаляет главу с гарантированным явным каскадным удалением
    всех баблов и страниц, чтобы не оставлять сиротских записей в SQLite.
    """
    try:
        with db_session() as cur:
            # 1. Удаляем все текстовые блоки страниц этой главы
            cur.execute(
                """
                DELETE FROM text_blocks 
                WHERE page_id IN (SELECT id FROM pages WHERE chapter_id = ?)
                """,
                (chapter_id,)
            )
            # 2. Удаляем сами страницы главы
            cur.execute("DELETE FROM pages WHERE chapter_id = ?", (chapter_id,))
            # 3. Удаляем саму главу
            cur.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))

        logger.info(f"Глава ID {chapter_id} и все её страницы/баблы полностью удалены из БД.")
        return {"success": True, "message": "Глава успешно удалена"}
    except Exception as e:
        logger.error(f"Ошибка при удалении главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/translate-all")
async def translate_entire_chapter(chapter_id: int):
    """Автоматический перевод главы через встроенную модель Gemini."""
    try:
        count = translate_entire_chapter_service(chapter_id)
        return {"success": True, "translated_blocks": count}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка перевода главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{chapter_id}/export-dialogue")
async def export_chapter_dialogue(chapter_id: int):
    """Экспорт скрипта главы в JSON с промптом для Claude/ChatGPT."""
    try:
        json_content, filename = export_chapter_dialogue_payload(chapter_id)
        encoded_filename = quote(filename)

        return Response(
            content=json_content,
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка экспорта скрипта главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{chapter_id}/import-dialogue")
async def import_chapter_dialogue(chapter_id: int, file: UploadFile = File(...)):
    """Импорт готового JSON из Claude/ChatGPT."""
    try:
        raw_bytes = await file.read()
        res = import_chapter_dialogue_payload(chapter_id, raw_bytes)
        return {"success": True, **res}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка импорта скрипта главы {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
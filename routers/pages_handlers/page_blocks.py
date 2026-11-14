from fastapi import HTTPException
from database import get_db
from schemas import SavePageBlocksRequest
from services.page_service import save_page_blocks_service


def get_page_blocks(page_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, page_id, class_id, x, y, width, height, rotation, jap_text, rus_text, speaker, order_index,
                   font_size, font_family, is_bold, is_italic, is_uppercase, has_stroke, text_color,
                   shape, padding_mode, min_hyphens, status 
            FROM text_blocks 
            WHERE page_id = ?
            ORDER BY order_index ASC
            """,
            (page_id,)
        )
        blocks = [dict(r) for r in cursor.fetchall()]

    return {"success": True, "blocks": blocks}


def save_page_blocks_endpoint(page_id: int, req: SavePageBlocksRequest):
    try:
        page_status = save_page_blocks_service(page_id, req.blocks)
        return {"success": True, "saved_count": len(req.blocks), "page_status": page_status}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

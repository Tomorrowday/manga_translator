from typing import Optional
from fastapi import HTTPException
from services.page_service import detect_page_bubbles_service


def detect_page_bubbles_by_id(
    page_id: int,
    conf: Optional[float] = None,
    auto_oval: Optional[bool] = None
):
    try:
        boxes, new_status, elapsed = detect_page_bubbles_service(
            page_id,
            conf_override=conf,
            auto_oval_override=auto_oval
        )
        return {
            "success": True,
            "boxes": boxes,
            "page_status": new_status,
            "time_seconds": elapsed
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        return {"success": False, "error": str(e)}

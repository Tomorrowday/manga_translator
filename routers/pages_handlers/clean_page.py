import os
import shutil
import time
from fastapi import HTTPException
from database import get_db
from routers.pages_handlers.common import _get_clean_backup_path, _backup_clean_file_if_exists
from services.page_service import clean_page_bubbles_service, revert_page_clean_service


def clean_page_bubbles(page_id: int, mode: str = "auto"):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT file_path, clean_path FROM pages WHERE id = ?", (page_id,))
            row = cur.fetchone()
            if row:
                _backup_clean_file_if_exists(str(row["file_path"]), row["clean_path"])

        clean_path, new_status, stats = clean_page_bubbles_service(page_id, clean_mode=mode)
        return {
            "success": True,
            "clean_path": clean_path,
            "page_status": new_status,
            "whitened": stats["white"],
            "inpainted": stats["inpaint"]
        }
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def revert_page_clean(page_id: int):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT file_path FROM pages WHERE id = ?", (page_id,))
            row = cur.fetchone()
            if row and row["file_path"]:
                backup_path = _get_clean_backup_path(str(row["file_path"]))
                if os.path.exists(backup_path):
                    try:
                        os.remove(backup_path)
                    except Exception:
                        pass

        new_status = revert_page_clean_service(page_id)
        return {"success": True, "page_status": new_status, "message": "Клин страницы успешно откачен"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def undo_last_clean_step(page_id: int):
    """Откатывает последний шаг Spot Clean / Brush Clean из сохранённого бэкапа."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT file_path, clean_path, status FROM pages WHERE id = ?", (page_id,))
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    orig_path = str(row["file_path"])
    clean_path = str(row["clean_path"]) if row["clean_path"] else ""
    backup_path = _get_clean_backup_path(orig_path)

    if os.path.exists(backup_path) and clean_path:
        try:
            shutil.copy2(backup_path, clean_path)
            os.remove(backup_path)
            return {
                "success": True,
                "restored_from_backup": True,
                "clean_path": clean_path,
                "page_status": row["status"],
                "timestamp": int(time.time() * 1000),
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка восстановления бэкапа клина: {e}")

    if clean_path and os.path.exists(clean_path):
        new_status = revert_page_clean_service(page_id)
        return {
            "success": True,
            "restored_from_backup": False,
            "clean_path": None,
            "page_status": new_status,
            "timestamp": int(time.time() * 1000),
        }

    return {"success": False, "error": "Нет шагов клина для отката"}

import sqlite3
from database import db_session, get_db
from schemas import UpdateTitleSettingsRequest
from config import get_available_detectors, get_available_cleaners
from ml.models import ml
from logger import logger


def _ensure_global_settings_columns(cur: sqlite3.Cursor):
    """Гарантирует существование всех требуемых колонок в таблице global_settings."""
    cur.execute("PRAGMA table_info(global_settings)")
    cols = {row[1] for row in cur.fetchall()}
    if "show_sfx" not in cols:
        try:
            cur.execute("ALTER TABLE global_settings ADD COLUMN show_sfx INTEGER DEFAULT 0")
        except Exception as e:
            logger.debug(f"Колонка show_sfx уже существует или ошибка добавления: {e}")


def get_global_settings_endpoint():
    """Получить глобальные настройки приложения."""
    with get_db() as conn:
        cursor = conn.cursor()
        _ensure_global_settings_columns(cursor)
        cursor.execute("SELECT * FROM global_settings WHERE id = 1")
        row = cursor.fetchone()

    settings = dict(row) if row else {
        "detector_model": "yolo_manga.pt",
        "clean_model": "anime-manga-big-lama.pt",
        "detect_conf": 0.25,
        "auto_oval_bubble": 1,
        "default_padding": "safe",
        "default_hyphenation": 1,
        "font_bubble": "v_CCFaceFront",
        "font_thought": "v_CCFaceFront",
        "font_sfx": "v_Mighty Zeo 2.0",
        "lama_downscale": 0,
        "show_sfx": 0,
    }

    settings["auto_oval_bubble"] = bool(settings.get("auto_oval_bubble", 1))
    settings["default_hyphenation"] = bool(settings.get("default_hyphenation", 1))
    settings["lama_downscale"] = bool(settings.get("lama_downscale", 0))
    settings["show_sfx"] = bool(row["show_sfx"]) if (row and "show_sfx" in row.keys()) else False
    settings["available_detectors"] = get_available_detectors()
    settings["available_cleaners"] = get_available_cleaners()

    if hasattr(ml, "lama_downscale"):
        ml.lama_downscale = settings["lama_downscale"]

    return {"success": True, "settings": settings}


def update_global_settings_endpoint(req: UpdateTitleSettingsRequest):
    """Обновить глобальные настройки приложения (частичное обновление: None = оставить текущее)."""
    with get_db() as conn:
        cursor = conn.cursor()
        _ensure_global_settings_columns(cursor)
        cursor.execute("SELECT * FROM global_settings WHERE id = 1")
        row = cursor.fetchone()

    current = dict(row) if row else {}

    detector_req = req.detector_model.strip() if req.detector_model else None
    cleaner_req = req.clean_model.strip() if req.clean_model else None
    if cleaner_req == "simple_lama":
        cleaner_req = "anime-manga-big-lama.pt"

    detector = detector_req if detector_req is not None else (current.get("detector_model") or "yolo_manga.pt")
    cleaner = cleaner_req if cleaner_req is not None else (current.get("clean_model") or "anime-manga-big-lama.pt")
    if cleaner == "simple_lama":
        cleaner = "anime-manga-big-lama.pt"

    conf = float(req.detect_conf) if req.detect_conf is not None else float(current.get("detect_conf") or 0.25)

    if req.auto_oval_bubble is not None:
        auto_oval = 1 if req.auto_oval_bubble else 0
    else:
        auto_oval = int(current.get("auto_oval_bubble") or 0)

    if req.default_padding in ["safe", "fit"]:
        padding = req.default_padding
    elif current.get("default_padding") in ["safe", "fit"]:
        padding = current["default_padding"]
    else:
        padding = "safe"

    if req.default_hyphenation is not None:
        hyph = 1 if req.default_hyphenation else 0
    else:
        hyph = int(current.get("default_hyphenation") or 0)

    font_b = req.font_bubble if req.font_bubble is not None else (current.get("font_bubble") or "v_CCFaceFront")
    font_t = req.font_thought if req.font_thought is not None else (current.get("font_thought") or "v_CCFaceFront")
    font_s = req.font_sfx if req.font_sfx is not None else (current.get("font_sfx") or "v_Mighty Zeo 2.0")

    if req.lama_downscale is not None:
        downscale = 1 if req.lama_downscale else 0
    else:
        downscale = int(current.get("lama_downscale") or 0)

    if req.show_sfx is not None:
        show_sfx_val = 1 if req.show_sfx else 0
    else:
        show_sfx_val = int(current.get("show_sfx") or 0)

    with db_session() as cur:
        _ensure_global_settings_columns(cur)
        cur.execute(
            """
            INSERT INTO global_settings (
                id, detector_model, clean_model, detect_conf,
                auto_oval_bubble, default_padding, default_hyphenation,
                font_bubble, font_thought, font_sfx, lama_downscale, show_sfx
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                detector_model = excluded.detector_model,
                clean_model = excluded.clean_model,
                detect_conf = excluded.detect_conf,
                auto_oval_bubble = excluded.auto_oval_bubble,
                default_padding = excluded.default_padding,
                default_hyphenation = excluded.default_hyphenation,
                font_bubble = excluded.font_bubble,
                font_thought = excluded.font_thought,
                font_sfx = excluded.font_sfx,
                lama_downscale = excluded.lama_downscale,
                show_sfx = excluded.show_sfx
            """,
            (detector, cleaner, conf, auto_oval, padding, hyph, font_b, font_t, font_s, downscale, show_sfx_val)
        )

        cur.execute("SELECT show_sfx FROM global_settings WHERE id = 1")
        row_sfx = cur.fetchone()
        actual_show_sfx = bool(row_sfx["show_sfx"]) if (row_sfx and "show_sfx" in row_sfx.keys()) else False

    if hasattr(ml, "lama_downscale"):
        ml.lama_downscale = bool(downscale)

    logger.info(f"Глобальные настройки обновлены: сжатие={bool(downscale)}, show_sfx={actual_show_sfx}.")
    return {
        "success": True,
        "settings": {
            "detector_model": detector,
            "clean_model": cleaner,
            "detect_conf": conf,
            "auto_oval_bubble": bool(auto_oval),
            "default_padding": padding,
            "default_hyphenation": bool(hyph),
            "font_bubble": font_b,
            "font_thought": font_t,
            "font_sfx": font_s,
            "lama_downscale": bool(downscale),
            "show_sfx": actual_show_sfx,
        }
    }


def get_available_detectors_endpoint():
    return {"success": True, "detectors": get_available_detectors()}


def get_available_cleaners_endpoint():
    return {"success": True, "cleaners": get_available_cleaners()}

# services/page_service_ops/active_settings.py
# Чтение актуальных настроек приложения из таблицы global_settings

from typing import Dict, Any

from database import get_db


def get_active_global_settings() -> Dict[str, Any]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM global_settings WHERE id = 1")
    row = cur.fetchone()
    conn.close()

    if row:
        return dict(row)
    return {
        "detector_model": "yolo_manga.pt",
        "clean_model": "anime-manga-big-lama.pt",
        "detect_conf": 0.25,
        "auto_oval_bubble": 1,
        "default_padding": "safe",
        "default_hyphenation": 1,
        "font_bubble": "v_CCFaceFront",
        "font_thought": "v_CCFaceFront",
        "font_sfx": "v_Mighty Zeo 2.0",
        "lama_precision": "fp32",
        "lama_downscale": 0,
        "show_sfx": 0,
    }

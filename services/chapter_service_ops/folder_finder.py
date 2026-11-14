# services/chapter_service_ops/folder_finder.py
# Определение папки главы на диске и поиск свежего JSON с репликами

import os
from pathlib import Path
from typing import Optional

from database import get_db


def get_chapter_folder_path(chapter_id: int) -> Optional[str]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT folder_path FROM chapters WHERE id = ?", (chapter_id,))
        row = cur.fetchone()
        folder = row["folder_path"] if row and row["folder_path"] else None

        if not folder or not os.path.exists(folder):
            cur.execute("SELECT file_path FROM pages WHERE chapter_id = ? LIMIT 1", (chapter_id,))
            p_row = cur.fetchone()
            if p_row and p_row["file_path"] and os.path.exists(p_row["file_path"]):
                folder = os.path.dirname(p_row["file_path"])

    return folder


def find_latest_dialogue_json_in_folder(chapter_id: int) -> Optional[str]:
    """
    Приоритетно ищет файл *_dialogues.json в папке главы.
    Если не найден, ищет любой .json, кроме файлов _context.json.
    """
    folder = get_chapter_folder_path(chapter_id)
    if not folder or not os.path.exists(folder):
        return None

    # 1. Приоритетный поиск файлов с суффиксом _dialogues.json
    dialogue_files = list(Path(folder).glob("*_dialogues.json"))
    if dialogue_files:
        dialogue_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        return str(dialogue_files[0])

    # 2. Поиск любых других json-файлов за исключением _context.json
    other_json = [f for f in Path(folder).glob("*.json") if not f.name.endswith("_context.json")]
    if other_json:
        other_json.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        return str(other_json[0])

    return None

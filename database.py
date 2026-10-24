# database.py
"""
Каркас доступа к локальной базе данных SQLite и паспорт схемы данных.
Реализация: database_impl.py
Зависимости реализации: sqlite3, contextlib, config.DB_PATH

СХЕМА ТАБЛИЦ БАЗЫ ДАННЫХ:
---------------------------------------------------------------------------------------------------
1. global_settings:
   - id INTEGER PRIMARY KEY CHECK (id = 1)
   - default_font_size INTEGER DEFAULT 14
   - detector_model TEXT DEFAULT 'yolo_manga.pt'
   - clean_model TEXT DEFAULT 'anime-manga-big-lama.pt'
   - detect_conf REAL DEFAULT 0.25
   - auto_oval_bubble INTEGER DEFAULT 1
   - default_padding TEXT DEFAULT 'safe'
   - default_hyphenation INTEGER DEFAULT 1
   - font_bubble TEXT DEFAULT 'v_CCFaceFront'
   - font_thought TEXT DEFAULT 'v_CCFaceFront'
   - font_sfx TEXT DEFAULT 'v_Mighty Zeo 2.0'
   - lama_downscale INTEGER DEFAULT 0

2. titles:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - name TEXT NOT NULL
   - folder_path TEXT NOT NULL
   - description TEXT DEFAULT ''
   - default_font_size INTEGER DEFAULT 14
   - detector_model TEXT DEFAULT 'yolo_manga.pt'
   - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

3. chapters:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - title_id INTEGER FK -> titles(id) ON DELETE CASCADE
   - volume_number TEXT DEFAULT '1'
   - chapter_number TEXT NOT NULL
   - folder_path TEXT

4. pages:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - chapter_id INTEGER FK -> chapters(id) ON DELETE CASCADE
   - page_number INTEGER
   - file_path TEXT NOT NULL
   - clean_path TEXT
   - status TEXT DEFAULT 'raw' ('raw', 'new', 'detected', 'cleaned', 'translated', 'done')

5. text_blocks:
   - id TEXT PRIMARY KEY (UUID)
   - page_id INTEGER FK -> pages(id) ON DELETE CASCADE
   - class_id INTEGER DEFAULT 0 (0: Bubble, 1: Thought, 2: Text/SFX)
   - x REAL, y REAL, width REAL, height REAL, rotation REAL DEFAULT 0.0
   - jap_text TEXT DEFAULT '', rus_text TEXT DEFAULT '', speaker TEXT DEFAULT ''
   - order_index INTEGER DEFAULT 0
   - font_size INTEGER (NULL = Auto)
   - font_family TEXT DEFAULT 'v_CCFaceFront'
   - is_bold INTEGER DEFAULT 0, is_italic INTEGER DEFAULT 0, is_uppercase INTEGER DEFAULT 0
   - has_stroke INTEGER DEFAULT 0
   - text_color TEXT DEFAULT 'black' ('black', 'white')
   - shape TEXT DEFAULT 'rect' ('rect', 'ellipse')
   - padding_mode TEXT DEFAULT 'safe' ('safe', 'fit')
   - min_hyphens INTEGER DEFAULT 1
   - status TEXT DEFAULT 'new'

6. glossary:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - title_id INTEGER NOT NULL FK -> titles(id) ON DELETE CASCADE
   - jap_word TEXT NOT NULL
   - rus_word TEXT NOT NULL
   - context TEXT DEFAULT ''
---------------------------------------------------------------------------------------------------
"""

import sqlite3
from typing import Iterator
from contextlib import contextmanager
import database_impl as _impl


def get_db() -> sqlite3.Connection:
    """Возвращает прямое соединение с SQLite БД со строковым row_factory и включенными FK."""
    return _impl.get_db()


@contextmanager
def db_session() -> Iterator[sqlite3.Cursor]:
    """Контекстный менеджер транзакции: авто-commit при успехе, rollback при ошибке."""
    with _impl.db_session() as cursor:
        yield cursor


def init_db() -> None:
    """Инициализация таблиц, проверка/накатывание миграций и удаление сиротских записей."""
    _impl.init_db()
# database.py
import sqlite3
from contextlib import contextmanager
from config import DB_PATH


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_session():
    conn = get_db()
    cursor = conn.cursor()
    try:
        yield cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db_session() as cursor:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS titles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                folder_path TEXT NOT NULL,
                description TEXT DEFAULT '',
                default_font_size INTEGER DEFAULT 14,
                detector_model TEXT DEFAULT 'yolo_manga.pt',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title_id INTEGER,
                volume_number TEXT DEFAULT '1',
                chapter_number TEXT NOT NULL,
                folder_path TEXT,
                FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter_id INTEGER,
                page_number INTEGER,
                file_path TEXT NOT NULL,
                clean_path TEXT,
                status TEXT DEFAULT 'raw',
                FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS text_blocks (
                id TEXT PRIMARY KEY,
                page_id INTEGER,
                x REAL, y REAL, width REAL, height REAL,
                rotation REAL DEFAULT 0.0,
                jap_text TEXT DEFAULT '',
                rus_text TEXT DEFAULT '',
                speaker TEXT DEFAULT '',
                order_index INTEGER DEFAULT 0,
                font_size INTEGER,
                font_family TEXT DEFAULT 'v_CCFaceFront',
                is_bold INTEGER DEFAULT 0,
                is_italic INTEGER DEFAULT 0,
                is_uppercase INTEGER DEFAULT 0,
                has_stroke INTEGER DEFAULT 0,
                text_color TEXT DEFAULT 'black',
                shape TEXT DEFAULT 'rect',
                padding_mode TEXT DEFAULT 'safe',
                min_hyphens INTEGER DEFAULT 1,
                status TEXT DEFAULT 'new',
                FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS glossary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title_id INTEGER NOT NULL,
                jap_word TEXT NOT NULL,
                rus_word TEXT NOT NULL,
                context TEXT DEFAULT '',
                FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE
            )
        ''')

        # Проверка и миграции titles
        cursor.execute("PRAGMA table_info(titles)")
        title_cols = [row["name"] for row in cursor.fetchall()]
        if "description" not in title_cols:
            cursor.execute("ALTER TABLE titles ADD COLUMN description TEXT DEFAULT ''")
            print("Миграция: добавлена колонка 'description' в titles")
        if "default_font_size" not in title_cols:
            cursor.execute("ALTER TABLE titles ADD COLUMN default_font_size INTEGER DEFAULT 14")
            print("Миграция: добавлена колонка 'default_font_size' в titles")
        if "detector_model" not in title_cols:
            cursor.execute("ALTER TABLE titles ADD COLUMN detector_model TEXT DEFAULT 'yolo_manga.pt'")
            print("Миграция: добавлена колонка 'detector_model' в titles")

        # Проверка миграций text_blocks
        cursor.execute("PRAGMA table_info(text_blocks)")
        columns = [row["name"] for row in cursor.fetchall()]

        migrations = {
            "speaker": "TEXT DEFAULT ''",
            "order_index": "INTEGER DEFAULT 0",
            "font_size": "INTEGER",
            "font_family": "TEXT DEFAULT 'v_CCFaceFront'",
            "is_bold": "INTEGER DEFAULT 0",
            "is_italic": "INTEGER DEFAULT 0",
            "is_uppercase": "INTEGER DEFAULT 0",
            "has_stroke": "INTEGER DEFAULT 0",
            "text_color": "TEXT DEFAULT 'black'",
            "shape": "TEXT DEFAULT 'rect'",
            "padding_mode": "TEXT DEFAULT 'safe'",
            "rotation": "REAL DEFAULT 0.0",
            "min_hyphens": "INTEGER DEFAULT 1"
        }

        for col, col_type in migrations.items():
            if col not in columns:
                cursor.execute(f"ALTER TABLE text_blocks ADD COLUMN {col} {col_type}")
                print(f"Миграция: добавлена колонка '{col}' в text_blocks")

        # Автоматическая очистка сиротских записей
        cursor.execute("DELETE FROM text_blocks WHERE page_id NOT IN (SELECT id FROM pages)")
        cursor.execute("DELETE FROM pages WHERE chapter_id NOT IN (SELECT id FROM chapters)")
        cursor.execute("DELETE FROM chapters WHERE title_id NOT IN (SELECT id FROM titles)")

    print("База данных проверена, сиротские записи зачищены.")
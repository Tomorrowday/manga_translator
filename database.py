import sqlite3
from contextlib import contextmanager
from config import DB_PATH


def get_db():
    """Создаёт подключение к БД SQLite с поддержкой обращения по именам колонок."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")  # Включаем каскадное удаление
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_session():
    """Контекстный менеджер для безопасных транзакций с автокоммитом и откатом при ошибке."""
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
    """Инициализация БД и автоматическая миграция новых колонок."""
    with db_session() as cursor:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS titles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                folder_path TEXT NOT NULL,
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
                status TEXT DEFAULT 'new',
                FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS text_blocks (
                id TEXT PRIMARY KEY,
                page_id INTEGER,
                x REAL, y REAL, width REAL, height REAL,
                jap_text TEXT DEFAULT '',
                rus_text TEXT DEFAULT '',
                speaker TEXT DEFAULT '',
                order_index INTEGER DEFAULT 0,
                status TEXT DEFAULT 'new',
                FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
            )
        ''')

        # Безопасная миграция: проверяем наличие новых колонок в старой БД
        cursor.execute("PRAGMA table_info(text_blocks)")
        columns = [row["name"] for row in cursor.fetchall()]

        if "speaker" not in columns:
            cursor.execute("ALTER TABLE text_blocks ADD COLUMN speaker TEXT DEFAULT ''")
            print("Миграция: добавлена колонка 'speaker' в text_blocks")

        if "order_index" not in columns:
            cursor.execute("ALTER TABLE text_blocks ADD COLUMN order_index INTEGER DEFAULT 0")
            print("Миграция: добавлена колонка 'order_index' в text_blocks")

    print("База данных проверена и готова к работе.")
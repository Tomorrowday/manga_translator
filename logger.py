import sys
import logging
from logging.handlers import RotatingFileHandler
from config import BASE_DIR

# Папка для логов
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
LOG_FILE = LOGS_DIR / "app.log"

# Формат записей
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

logger = logging.getLogger("manga_translator")
logger.setLevel(logging.INFO)

# Если обработчики ещё не добавлены (чтобы избежать дублирования при reload)
if not logger.handlers:
    # 1. Запись в файл с ротацией (до 5 МБ, храним 3 последних файла) в UTF-8
    file_handler = RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT))
    logger.addHandler(file_handler)

    # 2. Вывод в консоль
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT))
    logger.addHandler(console_handler)
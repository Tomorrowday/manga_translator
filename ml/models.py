from manga_ocr import MangaOcr
from ultralytics import YOLO
import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL_NAME, YOLO_WEIGHTS_PATH


class MLContainer:
    """Хранилище загруженных моделей в памяти/видеопамяти."""
    mocr: MangaOcr = None
    yolo_model: YOLO = None
    gemini_model: genai.GenerativeModel = None


ml = MLContainer()


def load_ml_models():
    """Загрузка MangaOCR, YOLO и настройка Gemini SDK."""
    print("Загрузка MangaOCR...")
    ml.mocr = MangaOcr()

    print("Загрузка детектора YOLO...")
    try:
        ml.yolo_model = YOLO(str(YOLO_WEIGHTS_PATH))
        print("YOLO загружена успешно.")
    except Exception as e:
        print(f"Ошибка загрузки весов YOLO ({YOLO_WEIGHTS_PATH}): {e}")

    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        ml.gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        print(f"Gemini настроена (модель: {GEMINI_MODEL_NAME}).")
    else:
        print("ВНИМАНИЕ: GEMINI_API_KEY не указан в .env!")
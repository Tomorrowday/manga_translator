# ml/models.py
import os
from pathlib import Path
from manga_ocr import MangaOcr
from ultralytics import YOLO
import google.generativeai as genai
import torch
from torchvision import transforms
from PIL import Image

from config import (
    GEMINI_API_KEY,
    GEMINI_MODEL_NAME,
    YOLO_WEIGHTS_PATH,
    WEIGHTS_DIR,
)


class AnimeLamaWrapper:
    """Обертка для специализированной модели anime-manga-big-lama (.pt / TorchScript)."""
    def __init__(self, model_path: Path, device: str = "cuda" if torch.cuda.is_available() else "cpu"):
        self.device = device
        self.model = torch.jit.load(str(model_path), map_location=device)
        self.model.eval()

    @torch.inference_mode()
    def __call__(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        w, h = image.size
        # Ресайз до кратности 8 (требование ResNet-архитектуры LaMa)
        new_w = (w // 8) * 8
        new_h = (h // 8) * 8

        img_resized = image.resize((new_w, new_h), Image.Resampling.BILINEAR)
        mask_resized = mask.resize((new_w, new_h), Image.Resampling.NEAREST)

        img_tensor = transforms.ToTensor()(img_resized).unsqueeze(0).to(self.device)
        mask_tensor = transforms.ToTensor()(mask_resized).unsqueeze(0).to(self.device)
        # Бинаризация маски
        mask_tensor = (mask_tensor > 0.5).float()

        # Инференс специализированной модели
        out_tensor = self.model(img_tensor, mask_tensor)
        out_tensor = torch.clamp(out_tensor[0], 0, 1).cpu()

        out_pil = transforms.ToPILImage()(out_tensor)
        if (new_w, new_h) != (w, h):
            out_pil = out_pil.resize((w, h), Image.Resampling.LANCZOS)
        return out_pil


class MLContainer:
    """Хранилище загруженных моделей в памяти/видеопамяти."""
    mocr: MangaOcr = None
    yolo_model: YOLO = None
    gemini_model: genai.GenerativeModel = None
    inpaint_model = None


ml = MLContainer()


def load_ml_models():
    """Загрузка MangaOCR, YOLO, специализированной LaMa и Gemini."""
    print("Загрузка MangaOCR...")
    ml.mocr = MangaOcr()

    print("Загрузка детектора баблов YOLO...")
    try:
        ml.yolo_model = YOLO(str(YOLO_WEIGHTS_PATH))
        print("YOLO (баблы) загружена успешно.")
    except Exception as e:
        print(f"Ошибка загрузки YOLO: {e}")

    # Поиск специализированной модели LaMa для манги и скринтонов
    anime_lama_weights = None
    known_names = [
        "anime-manga-big-lama.pt",
        "anime_lama.pt",
        "AnimeMangaInpainting.pt",
        "lama_manga.pt",
        "generator.pt"
    ]
    for name in known_names:
        candidate = WEIGHTS_DIR / name
        if candidate.exists():
            anime_lama_weights = candidate
            break

    if anime_lama_weights:
        try:
            print(f"Загрузка специализированной модели AnimeMangaInpainting ({anime_lama_weights.name})...")
            ml.inpaint_model = AnimeLamaWrapper(anime_lama_weights)
            print("🚀 Anime-Manga LaMa (скринтоны + манга) успешно инициализирована!")
        except Exception as e:
            print(f"Не удалось загрузить AnimeMangaInpainting: {e}. Переход на fallback...")

    # Fallback на базовую simple-lama (Places2), если файла нет
    if ml.inpaint_model is None:
        try:
            from simple_lama_inpainting import SimpleLama
            print("Загрузка базовой SimpleLama (Places2)...")
            ml.inpaint_model = SimpleLama()
            print("Базовая SimpleLama загружена.")
        except Exception as e:
            print(f"Внимание: Не удалось загрузить ни одну модель Inpainting ({e}). Будет доступен только белый клин.")

    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        ml.gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        print(f"Gemini настроена (модель: {GEMINI_MODEL_NAME}).")
    else:
        print("ВНИМАНИЕ: GEMINI_API_KEY не указан в .env!")
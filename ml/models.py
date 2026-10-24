# ml/models.py
# Загрузка MangaOCR, YOLO и локальной LaMa с сохранением оригинальной четкости (без ресайза)

from pathlib import Path
from typing import Dict, Optional
import warnings
import logging
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
from ultralytics import YOLO

from config import (
    YOLO_WEIGHTS_PATH,
    WEIGHTS_DIR,
    DETECT_MODELS_DIR,
    CLEAN_MODELS_DIR,
    BASE_DIR,
    get_available_detectors,
)

warnings.filterwarnings("ignore")
logging.getLogger("transformers").setLevel(logging.ERROR)
logging.getLogger("ultralytics").setLevel(logging.ERROR)


class AccurateLamaWrapper:
    """
    Обертка для моделей LaMa (.pt / TorchScript).
    Использует зеркальное дополнение (reflect padding) до кратности 8 без ресайза,
    что исключает размытие арта манги и скринтонов.
    """
    def __init__(self, model_path: Path, device: str = "cuda" if torch.cuda.is_available() else "cpu"):
        self.device = device
        self.model = torch.jit.load(str(model_path), map_location=device)
        self.model.eval()

    @torch.inference_mode()
    def __call__(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        orig_w, orig_h = image.size

        # Вычисляем паддинг до кратности 8 без масштабирования
        pad_w = (8 - orig_w % 8) % 8
        pad_h = (8 - orig_h % 8) % 8

        img_np = np.array(image.convert("RGB")).astype(np.float32) / 255.0
        mask_np = np.array(mask.convert("L")).astype(np.float32)
        mask_np = (mask_np > 127).astype(np.float32)

        img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(self.device)
        mask_tensor = torch.from_numpy(mask_np).unsqueeze(0).unsqueeze(0).to(self.device)

        if pad_w > 0 or pad_h > 0:
            img_tensor = F.pad(img_tensor, (0, pad_w, 0, pad_h), mode="reflect")
            mask_tensor = F.pad(mask_tensor, (0, pad_w, 0, pad_h), mode="reflect")

        out_tensor = self.model(img_tensor, mask_tensor)

        # Обрезаем обратно до исходных размеров (никакого размытия!)
        out_tensor = out_tensor[:, :, :orig_h, :orig_w]
        out_tensor = torch.clamp(out_tensor[0], 0, 1).permute(1, 2, 0).detach().cpu().numpy()

        out_uint8 = (out_tensor * 255.0).round().astype(np.uint8)
        return Image.fromarray(out_uint8)


class MLContainer:
    """Хранилище загруженных моделей в оперативной и видеопамяти."""
    mocr = None
    yolo_model: YOLO = None
    yolo_cache: Dict[str, YOLO] = {}
    inpaint_model = None
    active_clean_model_name: Optional[str] = None

    def get_yolo(self, model_name: str = "") -> YOLO:
        """Получить инстанс YOLO с кэшированием."""
        if not model_name:
            available = get_available_detectors()
            model_name = next(iter(available.keys()), "yolo_manga.pt")

        if model_name in self.yolo_cache:
            return self.yolo_cache[model_name]

        candidate = DETECT_MODELS_DIR / model_name
        if not candidate.exists():
            candidate = WEIGHTS_DIR / model_name
        if not candidate.exists():
            candidate = BASE_DIR / model_name
        if not candidate.exists():
            candidate = YOLO_WEIGHTS_PATH

        try:
            model = YOLO(str(candidate))
            self.yolo_cache[model_name] = model
            if self.yolo_model is None:
                self.yolo_model = model
            return model
        except Exception as e:
            if self.yolo_model:
                return self.yolo_model
            raise e

    def load_cleaner(self, model_name: str = ""):
        """Загрузка выбранной модели Inpainting из weights/clean-lama/ или fallback."""
        if model_name and self.active_clean_model_name == model_name and self.inpaint_model is not None:
            return self.inpaint_model

        if model_name == "simple_lama":
            try:
                from simple_lama_inpainting import SimpleLama
                self.inpaint_model = SimpleLama()
                self.active_clean_model_name = "simple_lama"
                return self.inpaint_model
            except Exception as e:
                print(f"[LaMa] Ошибка загрузки SimpleLama: {e}")

        candidate = None
        if model_name and model_name != "simple_lama":
            c1 = CLEAN_MODELS_DIR / model_name
            c2 = WEIGHTS_DIR / model_name
            if c1.exists():
                candidate = c1
            elif c2.exists():
                candidate = c2

        if not candidate:
            known_names = [
                "anime-manga-big-lama.pt",
                "anime_lama.pt",
                "AnimeMangaInpainting.pt",
                "lama_manga.pt",
                "generator.pt"
            ]
            for name in known_names:
                c1 = CLEAN_MODELS_DIR / name
                c2 = WEIGHTS_DIR / name
                if c1.exists():
                    candidate = c1
                    break
                if c2.exists():
                    candidate = c2
                    break

        if candidate and candidate.exists():
            try:
                self.inpaint_model = AccurateLamaWrapper(candidate)
                self.active_clean_model_name = candidate.name
                return self.inpaint_model
            except Exception:
                pass

        # Fallback на базовую библиотеку
        try:
            from simple_lama_inpainting import SimpleLama
            self.inpaint_model = SimpleLama()
            self.active_clean_model_name = "simple_lama"
            return self.inpaint_model
        except Exception:
            return None


ml = MLContainer()


def load_ml_models():
    """Начальная инициализация MangaOCR, детектора и клинера."""
    try:
        from manga_ocr import MangaOcr
        ml.mocr = MangaOcr()
    except Exception as e:
        print(f"[Внимание] Ошибка инициализации MangaOCR: {e}")

    try:
        ml.yolo_model = ml.get_yolo()
    except Exception as e:
        print(f"[Внимание] Ошибка загрузки YOLO: {e}")

    ml.load_cleaner()
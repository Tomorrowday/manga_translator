"""
ml/models.py - Загрузка MangaOCR, YOLO и LaMa с очисткой кэша VRAM после каждой операции.
"""

import os
import gc
import logging
from typing import Optional, Dict, Any

import torch
import torch.nn.functional as F
import numpy as np
from PIL import Image

import config

logger = logging.getLogger("manga_translator.ml")


def _get_device() -> torch.device:
    """Определяет доступное устройство (CUDA или CPU)."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def release_vram() -> dict:
    """Принудительно очищает кэш видеопамяти PyTorch и сборщик мусора."""
    vram_before = 0.0
    vram_after = 0.0

    if torch.cuda.is_available():
        vram_before = torch.cuda.memory_allocated() / (1024 * 1024)

    gc.collect()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        vram_after = torch.cuda.memory_allocated() / (1024 * 1024)

    freed = max(0.0, vram_before - vram_after)
    return {
        "vram_before_mb": round(vram_before, 1),
        "vram_after_mb": round(vram_after, 1),
        "freed_mb": round(freed, 1),
    }


class AccurateLamaWrapper:
    """
    Обёртка над TorchScript-моделью LaMa.
    Использует зеркальное дополнение (reflect padding) до кратности 8 без ресайза,
    что исключает замыливание арта манги.
    Очищает кэш CUDA сразу после каждого вызова.
    """

    def __init__(self, model: torch.jit.ScriptModule, device: torch.device):
        self.model = model
        self.device = device
        self.precision: str = "fp32"  # "fp32", "fp16", "bf16"

    @torch.inference_mode()
    def __call__(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        orig_w, orig_h = image.size

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

        out_uint8 = None
        device_type = "cuda" if "cuda" in str(self.device) else "cpu"

        try:
            if self.precision == "fp16" and device_type == "cuda":
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    out_tensor = self.model(img_tensor, mask_tensor)
            elif self.precision == "bf16" and device_type == "cuda":
                with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
                    out_tensor = self.model(img_tensor, mask_tensor)
            else:
                out_tensor = self.model(img_tensor, mask_tensor)

            out_tensor = out_tensor[:, :, :orig_h, :orig_w]
            out_tensor = torch.clamp(out_tensor[0], 0, 1).permute(1, 2, 0).detach().cpu().float().numpy()
            out_uint8 = (out_tensor * 255.0).round().astype(np.uint8)
        finally:
            del img_tensor, mask_tensor
            if "out_tensor" in locals():
                del out_tensor
            release_vram()

        return Image.fromarray(out_uint8)


class MLManager:
    """Менеджер ML-моделей: MangaOCR, YOLO, LaMa."""

    def __init__(self):
        self._device = _get_device()
        self._manga_ocr = None
        self._yolo_models: Dict[str, Any] = {}
        self._cleaners: Dict[str, Any] = {}
        self.gemini_model = None
        self.lama_precision: str = "fp32"
        self.lama_downscale: bool = False
        logger.info(f"MLManager инициализирован. Устройство: {self._device}")

    @property
    def device(self) -> torch.device:
        return self._device

    @property
    def mocr(self):
        """Гарантирует доступ к экземпляру MangaOCR."""
        if self._manga_ocr is None:
            self.load_manga_ocr()
        return self._manga_ocr

    def load_manga_ocr(self):
        if self._manga_ocr is not None:
            return self._manga_ocr

        logger.info("Загрузка MangaOCR...")
        try:
            from manga_ocr import MangaOcr
            self._manga_ocr = MangaOcr()
            logger.info("MangaOCR успешно загружен")
            return self._manga_ocr
        except Exception as e:
            logger.error(f"Ошибка загрузки MangaOCR: {e}")
            raise

    def get_yolo(self, model_name: Optional[str] = None):
        """Возвращает YOLO модель по имени файла или пути."""
        name = model_name or "yolo_manga.pt"
        if name in self._yolo_models:
            return self._yolo_models[name]

        # Ищем путь к файлу
        candidates = [
            config.DETECT_MODELS_DIR / name,
            config.WEIGHTS_DIR / name,
            config.BASE_DIR / name,
        ]
        target_path = None
        for p in candidates:
            if p.exists():
                target_path = str(p)
                break

        if not target_path:
            # Fallback
            target_path = str(config.YOLO_WEIGHTS_PATH)

        logger.info(f"Загрузка YOLO: {target_path}")
        from ultralytics import YOLO
        yolo_instance = YOLO(target_path)
        self._yolo_models[name] = yolo_instance
        return yolo_instance

    def load_cleaner(self, name: str = "anime-manga-big-lama.pt"):
        """Загружает модель LaMa."""
        if name in self._cleaners:
            cleaner = self._cleaners[name]
            cleaner.precision = self.lama_precision
            return cleaner

        candidates = [
            config.CLEAN_MODELS_DIR / name,
            config.WEIGHTS_DIR / name,
            config.BASE_DIR / name,
        ]
        target_path = None
        for p in candidates:
            if p.exists():
                target_path = str(p)
                break

        if not target_path:
            # Ищем любой доступный .pt файл клинера
            all_pt = list(config.CLEAN_MODELS_DIR.glob("*.pt")) or list(config.WEIGHTS_DIR.glob("*lama*.pt"))
            if all_pt:
                target_path = str(all_pt[0])
            else:
                raise FileNotFoundError(f"Файл модели клинера '{name}' не найден в папке weights/")

        logger.info(f"Загрузка TorchScript LaMa: {target_path}")
        base_model = torch.jit.load(target_path, map_location=self._device)
        base_model.eval()
        wrapper = AccurateLamaWrapper(base_model, self._device)
        wrapper.precision = self.lama_precision
        self._cleaners[name] = wrapper
        return wrapper

    def release_vram(self):
        return release_vram()

    def unload_all(self):
        self._manga_ocr = None
        self._yolo_models.clear()
        self._cleaners.clear()
        release_vram()


# Экспортируем глобальный экземпляр под обоими именами для совместимости
ml = MLManager()
ml_manager = ml


def load_ml_models(preload: bool = False) -> MLManager:
    """Точка входа инициализации при старте сервера."""
    logger.info(f"Инициализация моделей (устройство: {ml.device})...")
    if preload:
        try:
            ml.load_manga_ocr()
        except Exception as e:
            logger.warning(f"Предзагрузка MangaOCR пропущена: {e}")
        try:
            ml.get_yolo()
        except Exception as e:
            logger.warning(f"Предзагрузка YOLO пропущена: {e}")
    return ml
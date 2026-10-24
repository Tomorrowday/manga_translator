# ml/models.py
"""
Каркас менеджера ML-моделей (MangaOCR, YOLO, LaMa) и управления VRAM.
Реализация: ml/models_impl.py
Зависимости реализации: torch, numpy, PIL, gc, logging, config
"""

from typing import Optional, Dict, Any
import torch
import ml.models_impl as _impl

# Реэкспорт класса AccurateLamaWrapper для аннотаций типов
AccurateLamaWrapper = _impl.AccurateLamaWrapper


class MLManager:
    """Интерфейс MLManager, делегирующий вызовы к реализации ml/models_impl.py."""

    @property
    def device(self) -> torch.device:
        return _impl.ml.device

    @property
    def mocr(self) -> Any:
        return _impl.ml.mocr

    @property
    def lama_precision(self) -> str:
        return _impl.ml.lama_precision

    @lama_precision.setter
    def lama_precision(self, value: str) -> None:
        _impl.ml.lama_precision = value

    @property
    def lama_downscale(self) -> bool:
        return _impl.ml.lama_downscale

    @lama_downscale.setter
    def lama_downscale(self, value: bool) -> None:
        _impl.ml.lama_downscale = value

    def load_manga_ocr(self) -> Any:
        return _impl.ml.load_manga_ocr()

    def get_yolo(self, model_name: Optional[str] = None) -> Any:
        return _impl.ml.get_yolo(model_name)

    def load_cleaner(self, name: str = "anime-manga-big-lama.pt") -> Any:
        return _impl.ml.load_cleaner(name)

    def release_vram(self) -> Dict[str, float]:
        return _impl.ml.release_vram()

    def unload_all(self) -> None:
        _impl.ml.unload_all()


def release_vram() -> Dict[str, float]:
    """Принудительно очищает кэш видеопамяти PyTorch и сборщик мусора."""
    return _impl.release_vram()


def load_ml_models(preload: bool = False) -> MLManager:
    """Точка входа инициализации ML-моделей при старте приложения."""
    _impl.load_ml_models(preload=preload)
    return ml


# Глобальные синглтоны для совместимости со всеми импортами
ml: MLManager = _impl.ml
ml_manager: MLManager = _impl.ml_manager
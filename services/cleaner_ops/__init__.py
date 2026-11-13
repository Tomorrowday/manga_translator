# services/cleaner_ops/__init__.py
# Ре-экспорт публичных функций клинера для services/cleaner.py

from services.cleaner_ops.image_io import (
    load_image_cv2,
    save_image_cv2,
    is_patch_monochrome,
    get_box_geometry,
)
from services.cleaner_ops.white_bubble import (
    is_mostly_white_bubble,
    _create_shape_mask,
    _build_bubble_interior_mask,
    clean_white_bubble_patch,
)
from services.cleaner_ops.lama_inpaint import (
    inpaint_patch_with_lama,
    blend_inpainted_patch,
    _get_affine_points,
    _blend_rotated_patch,
)
from services.cleaner_ops.bubble_cleaner import (
    clean_speech_bubble,
    spot_clean_region,
)
from services.cleaner_ops.brush_cleaner import inpaint_by_brush_mask

__all__ = [
    "load_image_cv2",
    "save_image_cv2",
    "is_patch_monochrome",
    "get_box_geometry",
    "is_mostly_white_bubble",
    "_create_shape_mask",
    "_build_bubble_interior_mask",
    "clean_white_bubble_patch",
    "inpaint_patch_with_lama",
    "blend_inpainted_patch",
    "_get_affine_points",
    "_blend_rotated_patch",
    "clean_speech_bubble",
    "spot_clean_region",
    "inpaint_by_brush_mask",
]

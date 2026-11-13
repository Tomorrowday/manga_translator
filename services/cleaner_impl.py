# services/cleaner_impl.py
# Ре-экспорт алгоритмов клина баблов из пакета services/cleaner_ops/
#
# Состав пакета:
#   image_io.py      — load_image_cv2, save_image_cv2, is_patch_monochrome, get_box_geometry
#   white_bubble.py  — is_mostly_white_bubble, _create_shape_mask, _build_bubble_interior_mask, clean_white_bubble_patch
#   lama_inpaint.py  — inpaint_patch_with_lama, blend_inpainted_patch, _get_affine_points, _blend_rotated_patch
#   bubble_cleaner.py — clean_speech_bubble, spot_clean_region
#   brush_cleaner.py — inpaint_by_brush_mask

from services.cleaner_ops import (
    load_image_cv2,
    save_image_cv2,
    is_patch_monochrome,
    get_box_geometry,
    is_mostly_white_bubble,
    _create_shape_mask,
    _build_bubble_interior_mask,
    clean_white_bubble_patch,
    inpaint_patch_with_lama,
    blend_inpainted_patch,
    _get_affine_points,
    _blend_rotated_patch,
    clean_speech_bubble,
    spot_clean_region,
    inpaint_by_brush_mask,
)

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

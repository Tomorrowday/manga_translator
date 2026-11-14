# services/detector_ops/box_expander.py
# Дотягивание рамок YOLO до границ белых овалов баблов

from typing import List, Tuple, Optional
import numpy as np


def expand_box_to_bubble(
    gray_img: np.ndarray,
    orig_x1: int,
    orig_y1: int,
    orig_x2: int,
    orig_y2: int,
    other_boxes: Optional[List[Tuple[int, int, int, int]]] = None
) -> Tuple[int, int, int, int]:
    try:
        img_h, img_w = gray_img.shape[:2]

        x1 = max(0, min(img_w - 2, orig_x1))
        y1 = max(0, min(img_h - 2, orig_y1))
        x2 = max(x1 + 2, min(img_w, orig_x2))
        y2 = max(y1 + 2, min(img_h, orig_y2))

        bw = x2 - x1
        bh = y2 - y1

        if bw <= 4 or bh <= 4:
            return orig_x1, orig_y1, orig_x2, orig_y2

        roi = gray_img[y1:y2, x1:x2]
        if roi.size == 0 or np.mean(roi > 190) < 0.35:
            return orig_x1, orig_y1, orig_x2, orig_y2

        is_giant_page_strip = (bh > img_h * 0.40)
        max_expand_x = min(20, max(6, int(bw * 0.25))) if is_giant_page_strip else min(70, max(25, int(bh * 0.35)))
        max_expand_y = min(18, max(6, int(bh * 0.10)))

        hard_limit_left = 2
        hard_limit_right = img_w - 2
        hard_limit_top = 2
        hard_limit_bottom = img_h - 2

        if other_boxes:
            cx = (x1 + x2) // 2
            for ox1, oy1, ox2, oy2 in other_boxes:
                if min(y2, oy2) - max(y1, oy1) > 10:
                    ocx = (ox1 + ox2) // 2
                    if ocx < cx and ox2 < x1:
                        hard_limit_left = max(hard_limit_left, ox2 + 2)
                    elif ocx > cx and ox1 > x2:
                        hard_limit_right = min(hard_limit_right, ox1 - 2)

        y_slice_start = int(y1 + bh * 0.25)
        y_slice_end = int(y2 - bh * 0.25)
        if y_slice_end <= y_slice_start:
            y_slice_start, y_slice_end = y1, y2

        x_slice_start = int(x1 + bw * 0.25)
        x_slice_end = int(x2 - bw * 0.25)
        if x_slice_end <= x_slice_start:
            x_slice_start, x_slice_end = x1, x2

        left_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x1 - dx
            if cur_x <= hard_limit_left:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.mean(col < 130) > 0.25 or np.mean(col) < 185:
                break
            left_expand = dx

        right_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x2 + dx
            if cur_x >= hard_limit_right:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.mean(col < 130) > 0.25 or np.mean(col) < 185:
                break
            right_expand = dx

        top_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y1 - dy
            if cur_y <= hard_limit_top:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.mean(row_pix < 130) > 0.25 or np.mean(row_pix) < 185:
                break
            top_expand = dy

        bottom_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y2 + dy
            if cur_y >= hard_limit_bottom:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.mean(row_pix < 130) > 0.25 or np.mean(row_pix) < 185:
                break
            bottom_expand = dy

        pad_in = 2
        exp_x1 = max(hard_limit_left, x1 - max(0, left_expand - pad_in))
        exp_x2 = min(hard_limit_right, x2 + max(0, right_expand - pad_in))
        exp_y1 = max(hard_limit_top, y1 - max(0, top_expand - pad_in))
        exp_y2 = min(hard_limit_bottom, y2 + max(0, bottom_expand - pad_in))

        final_x1 = min(orig_x1, exp_x1)
        final_x2 = max(orig_x2, exp_x2)
        final_y1 = min(orig_y1, exp_y1)
        final_y2 = max(orig_y2, exp_y2)

        if (final_x2 - final_x1) < 24 and (final_y2 - final_y1) > 80:
            return orig_x1, orig_y1, orig_x2, orig_y2

        return final_x1, final_y1, final_x2, final_y2
    except Exception:
        return orig_x1, orig_y1, orig_x2, orig_y2

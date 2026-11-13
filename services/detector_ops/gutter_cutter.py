# services/detector_ops/gutter_cutter.py
# Рекурсивное разбиение страницы по белым просекам между фреймами манги

from typing import List, Dict, Any, Optional
import numpy as np

from services.detector_ops.region_sorter import _sort_region_reading_order


def _find_best_gutter_cut(
    gray_img: np.ndarray,
    items: List[Dict[str, Any]],
    ry1: int,
    ry2: int,
    rx1: int,
    rx2: int,
    axis: str,
) -> Optional[int]:
    img_h, img_w = gray_img.shape[:2]
    if ry2 - ry1 < 40 or rx2 - rx1 < 40 or len(items) < 2:
        return None

    sub = gray_img[ry1:ry2, rx1:rx2]
    dark_mask = sub < 180
    if not np.any(dark_mask):
        return None

    dark_ys, dark_xs = np.where(dark_mask)
    content_y1 = ry1 + int(np.percentile(dark_ys, 2))
    content_y2 = ry1 + int(np.percentile(dark_ys, 98))
    content_x1 = rx1 + int(np.percentile(dark_xs, 2))
    content_x2 = rx1 + int(np.percentile(dark_xs, 98))

    if content_y2 - content_y1 < 30 or content_x2 - content_x1 < 30:
        return None

    if axis == "h":
        min_c = int(min(it["cy"] for it in items) * img_h) + 2
        max_c = int(max(it["cy"] for it in items) * img_h) - 2
        if max_c - min_c < 10:
            return None

        forbidden = np.zeros(img_h, dtype=bool)
        for it in items:
            core_y1 = int((it["y1"] + it["h"] * 0.22) * img_h)
            core_y2 = int((it["y2"] - it["h"] * 0.22) * img_h)
            if core_y2 > core_y1:
                forbidden[max(0, core_y1):min(img_h, core_y2)] = True

        for i, a in enumerate(items):
            for b in items[i + 1:]:
                x_ov = max(0.0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"])) / min(a["w"], b["w"])
                y_gap = max(a["y1"], b["y1"]) - min(a["y2"], b["y2"])
                if x_ov >= 0.08 and y_gap <= 0.012:
                    join_y1 = int(min(a["cy"], b["cy"]) * img_h)
                    join_y2 = int(max(a["cy"], b["cy"]) * img_h)
                    forbidden[max(0, join_y1):min(img_h, join_y2)] = True

        roi_strip = gray_img[min_c:max_c + 1, content_x1:content_x2].copy()
        if roi_strip.size == 0:
            return None

        for it in items:
            bx1 = max(0, int(it["x1"] * img_w) - content_x1 - 3)
            bx2 = min(content_x2 - content_x1, int(it["x2"] * img_w) - content_x1 + 3)
            if bx2 <= bx1:
                continue
            top_tip_y1 = max(min_c, int(it["y1"] * img_h) - 2) - min_c
            top_tip_y2 = min(max_c + 1, int((it["y1"] + it["h"] * 0.22) * img_h)) - min_c
            if top_tip_y2 > top_tip_y1:
                roi_strip[top_tip_y1:top_tip_y2, bx1:bx2] = 255

            bot_tip_y1 = max(min_c, int((it["y2"] - it["h"] * 0.22) * img_h)) - min_c
            bot_tip_y2 = min(max_c + 1, int(it["y2"] * img_h) + 2) - min_c
            if bot_tip_y2 > bot_tip_y1:
                roi_strip[bot_tip_y1:bot_tip_y2, bx1:bx2] = 255

        dark_ratio = np.mean(roi_strip < 200, axis=1)
        mean_val = np.mean(roi_strip, axis=1)
        is_white_row = (dark_ratio < 0.030) & (mean_val > 238.0) & (~forbidden[min_c:max_c + 1])

        best_cut = None
        best_score = -1.0
        n = len(is_white_row)
        i = 0
        while i < n:
            if not is_white_row[i]:
                i += 1
                continue
            j = i
            while j < n and is_white_row[j]:
                j += 1
            run_len = j - i
            if run_len >= 3:
                cut_y = min_c + (i + j) // 2
                top_group = [it for it in items if it["cy"] * img_h < cut_y]
                bot_group = [it for it in items if it["cy"] * img_h >= cut_y]
                if top_group and bot_group:
                    band_top = max(ry1, min_c + i - 10)
                    band_bot = min(ry2, min_c + j + 10)
                    top_border = gray_img[band_top:min_c + i, content_x1:content_x2]
                    bot_border = gray_img[min_c + j:band_bot, content_x1:content_x2]
                    top_line_strength = float(np.max(np.mean(top_border < 165, axis=1))) if top_border.size > 0 else 0.0
                    bot_line_strength = float(np.max(np.mean(bot_border < 165, axis=1))) if bot_border.size > 0 else 0.0
                    border_strength = max(top_line_strength, bot_line_strength)

                    if border_strength >= 0.28 or (run_len >= 7 and border_strength >= 0.16):
                        score = run_len * (0.5 + border_strength)
                        if score > best_score:
                            best_score = score
                            best_cut = cut_y
            i = j

        return best_cut

    else:
        min_c = int(min(it["cx"] for it in items) * img_w) + 2
        max_c = int(max(it["cx"] for it in items) * img_w) - 2
        if max_c - min_c < 10:
            return None

        forbidden = np.zeros(img_w, dtype=bool)
        for it in items:
            core_x1 = int((it["x1"] + it["w"] * 0.22) * img_w)
            core_x2 = int((it["x2"] - it["w"] * 0.22) * img_w)
            if core_x2 > core_x1:
                forbidden[max(0, core_x1):min(img_w, core_x2)] = True

        for i, a in enumerate(items):
            for b in items[i + 1:]:
                y_ov = max(0.0, min(a["y2"], b["y2"]) - max(a["y1"], b["y1"])) / min(a["h"], b["h"])
                x_gap = max(a["x1"], b["x1"]) - min(a["x2"], b["x2"])
                if y_ov >= 0.18 and x_gap <= 0.012:
                    join_x1 = int(min(a["cx"], b["cx"]) * img_w)
                    join_x2 = int(max(a["cx"], b["cx"]) * img_w)
                    forbidden[max(0, join_x1):min(img_w, join_x2)] = True

        roi_strip = gray_img[content_y1:content_y2, min_c:max_c + 1].copy()
        if roi_strip.size == 0:
            return None

        for it in items:
            by1 = max(0, int(it["y1"] * img_h) - content_y1 - 3)
            by2 = min(content_y2 - content_y1, int(it["y2"] * img_h) - content_y1 + 3)
            if by2 <= by1:
                continue
            left_tip_x1 = max(min_c, int(it["x1"] * img_w) - 2) - min_c
            left_tip_x2 = min(max_c + 1, int((it["x1"] + it["w"] * 0.22) * img_w)) - min_c
            if left_tip_x2 > left_tip_x1:
                roi_strip[by1:by2, left_tip_x1:left_tip_x2] = 255

            right_tip_x1 = max(min_c, int((it["x2"] - it["w"] * 0.22) * img_w)) - min_c
            right_tip_x2 = min(max_c + 1, int(it["x2"] * img_w) + 2) - min_c
            if right_tip_x2 > right_tip_x1:
                roi_strip[by1:by2, right_tip_x1:right_tip_x2] = 255

        dark_ratio = np.mean(roi_strip < 200, axis=0)
        mean_val = np.mean(roi_strip, axis=0)
        is_white_col = (dark_ratio < 0.030) & (mean_val > 238.0) & (~forbidden[min_c:max_c + 1])

        best_cut = None
        best_score = -1.0
        n = len(is_white_col)
        i = 0
        while i < n:
            if not is_white_col[i]:
                i += 1
                continue
            j = i
            while j < n and is_white_col[j]:
                j += 1
            run_len = j - i
            if run_len >= 3:
                cut_x = min_c + (i + j) // 2
                right_group = [it for it in items if it["cx"] * img_w >= cut_x]
                left_group = [it for it in items if it["cx"] * img_w < cut_x]
                if right_group and left_group:
                    band_left = max(rx1, min_c + i - 10)
                    band_right = min(rx2, min_c + j + 10)
                    left_border = gray_img[content_y1:content_y2, band_left:min_c + i]
                    right_border = gray_img[content_y1:content_y2, min_c + j:band_right]
                    left_strength = float(np.max(np.mean(left_border < 165, axis=0))) if left_border.size > 0 else 0.0
                    right_strength = float(np.max(np.mean(right_border < 165, axis=0))) if right_border.size > 0 else 0.0
                    border_strength = max(left_strength, right_strength)

                    if border_strength >= 0.28 or (run_len >= 7 and border_strength >= 0.16):
                        score = run_len * (0.5 + border_strength)
                        if score > best_score:
                            best_score = score
                            best_cut = cut_x
            i = j

        return best_cut


def _partition_and_sort_xy(
    gray_img: np.ndarray,
    items: List[Dict[str, Any]],
    ry1: int,
    ry2: int,
    rx1: int,
    rx2: int,
    depth: int = 0,
) -> List[Dict[str, Any]]:
    if len(items) <= 1 or depth >= 6:
        return items

    img_h, img_w = gray_img.shape[:2]

    cut_y = _find_best_gutter_cut(gray_img, items, ry1, ry2, rx1, rx2, axis="h")
    if cut_y is not None:
        top_items = [it for it in items if it["cy"] * img_h < cut_y]
        bot_items = [it for it in items if it["cy"] * img_h >= cut_y]
        if top_items and bot_items:
            return (
                _partition_and_sort_xy(gray_img, top_items, ry1, cut_y, rx1, rx2, depth + 1)
                + _partition_and_sort_xy(gray_img, bot_items, cut_y, ry2, rx1, rx2, depth + 1)
            )

    cut_x = _find_best_gutter_cut(gray_img, items, ry1, ry2, rx1, rx2, axis="v")
    if cut_x is not None:
        right_items = [it for it in items if it["cx"] * img_w >= cut_x]
        left_items = [it for it in items if it["cx"] * img_w < cut_x]
        if right_items and left_items:
            return (
                _partition_and_sort_xy(gray_img, right_items, ry1, ry2, cut_x, rx2, depth + 1)
                + _partition_and_sort_xy(gray_img, left_items, ry1, ry2, rx1, cut_x, depth + 1)
            )

    return _sort_region_reading_order(items)

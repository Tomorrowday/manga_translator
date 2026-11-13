# services/cleaner_ops/white_bubble.py
# Морфологическая очистка белых речевых баблов

import cv2
import numpy as np


def is_mostly_white_bubble(roi: np.ndarray, gray: np.ndarray) -> bool:
    if gray.size == 0:
        return False
    if np.mean(gray >= 238) < 0.70:
        return False
    if np.mean((gray >= 70) & (gray <= 215)) > 0.09:
        return False
    light_pixels = gray[gray >= 200]
    if light_pixels.size > 0 and np.std(light_pixels) > 12.0:
        return False
    return float(np.mean(gray)) >= 215.0


def _create_shape_mask(h: int, w: int, shape: str = "rect") -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.uint8)
    if shape == "ellipse":
        cv2.ellipse(mask, (w // 2, h // 2), (w // 2, h // 2), 0, 0, 360, 255, -1)
    else:
        mask.fill(255)
    return mask


def _build_bubble_interior_mask(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape[:2]
    _, white_canvas = cv2.threshold(gray, 215, 255, cv2.THRESH_BINARY)
    kernel_3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    eroded_white = cv2.erode(white_canvas, kernel_3, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(eroded_white, connectivity=4)
    cy1, cy2 = int(h * 0.20), max(int(h * 0.20) + 1, int(h * 0.80))
    cx1, cx2 = int(w * 0.20), max(int(w * 0.20) + 1, int(w * 0.80))
    center_labels = np.unique(labels[cy1:cy2, cx1:cx2])

    interior_white = np.zeros_like(gray)
    min_area = (h * w) * 0.05

    for lbl in center_labels:
        if lbl != 0 and stats[lbl, cv2.CC_STAT_AREA] >= min_area:
            interior_white[labels == lbl] = 255

    if np.sum(interior_white) == 0 and num_labels > 1:
        best_lbl = max((lbl for lbl in center_labels if lbl != 0), key=lambda l: stats[l, cv2.CC_STAT_AREA], default=0)
        if best_lbl > 0:
            interior_white[labels == best_lbl] = 255

    if np.sum(interior_white) == 0:
        interior_mask = np.full_like(gray, 255)
    else:
        interior_white = cv2.dilate(interior_white, kernel_3, iterations=1)
        interior_white[gray < 180] = 0
        contours, _ = cv2.findContours(interior_white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        interior_mask = np.zeros_like(gray)
        if contours:
            cv2.fillPoly(interior_mask, contours, 255)
        interior_mask = cv2.erode(interior_mask, kernel_3, iterations=1)

    return interior_mask


def clean_white_bubble_patch(roi: np.ndarray, gray: np.ndarray):
    h_roi, w_roi = roi.shape[:2]
    if h_roi < 3 or w_roi < 3:
        return

    interior_mask = _build_bubble_interior_mask(gray)
    _, dark_mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(dark_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    text_clean_mask = np.zeros_like(gray)
    border_mask = np.zeros_like(gray)
    edge_margin = 2

    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)
        touches_edge = (
            cx <= edge_margin or
            cy <= edge_margin or
            (cx + cw) >= w_roi - edge_margin or
            (cy + ch) >= h_roi - edge_margin
        )
        is_large = (cw >= w_roi * 0.70 and ch >= h_roi * 0.70)

        if touches_edge or is_large:
            cv2.drawContours(border_mask, [cnt], -1, 255, thickness=cv2.FILLED)
            continue

        cnt_mask = np.zeros_like(gray)
        cv2.fillPoly(cnt_mask, [cnt], 255)

        inside_ratio = np.sum((cnt_mask == 255) & (interior_mask == 255)) / float(max(1, np.sum(cnt_mask == 255)))
        if inside_ratio < 0.75:
            cv2.drawContours(border_mask, [cnt], -1, 255, thickness=cv2.FILLED)
            continue

        cv2.fillPoly(text_clean_mask, [cnt], 255)

    if np.sum(text_clean_mask) == 0:
        return

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dilated_text = cv2.dilate(text_clean_mask, kernel, iterations=2)
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dilated_text = cv2.morphologyEx(dilated_text, cv2.MORPH_CLOSE, close_kernel, iterations=1)

    border_shield = cv2.dilate(border_mask, kernel, iterations=1)
    dilated_text[border_shield == 255] = 0
    dilated_text[interior_mask == 0] = 0

    roi[dilated_text == 255] = [255, 255, 255]

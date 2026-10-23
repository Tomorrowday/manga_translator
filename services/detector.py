# services/detector.py
# Детекция речевых баблов и текста (YOLO), фильтрация и извлечение class_id

from typing import List, Dict, Any, Tuple, Optional
from collections import Counter
import cv2
import numpy as np
from PIL import Image
import torch
from ml.models import ml
from logger import logger


def manga_sort_key(box: Dict[str, Any]) -> tuple:
    """
    Устаревший ключ сортировки по жесткой сетке (оставлен для обратной совместимости).
    Для основной сортировки используется sort_manga_reading_order().
    """
    row_height = 0.18
    row_idx = int(box["y"] / row_height)
    return row_idx, -box["x"]


def _sort_region_reading_order(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Внутрикадровая / внутриполосная двухфазная топологическая сортировка:
    1. Поддерживает как вертикальные, так и диагональные сдвоенные баблы (например, 6->9 и 7->8).
    2. При горизонтальном расширении яруса влево сверяет высоту с верхним опорным баблом правой колонки,
       а не с нижней долькой сдвоенного бабла (исключает захват баблов из соседних колонок ниже).
    3. Запрещает утягивание левого бабла нового ряда вверх (has_unassigned_right_peer), если справа
       на его уровне высоты есть еще не распределенные баблы.
    4. Внутри каждого яруса объединяет колонки и диагональные связки спикеров:
       колонки сортируются СПРАВА НАЛЕВО, а внутри колонки/связки — СВЕРХУ ВНИЗ.
    """
    if len(items) <= 1:
        return items

    def x_overlap_ratio(a: Dict[str, Any], b: Dict[str, Any]) -> float:
        ov = max(0.0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"]))
        return ov / min(a["w"], b["w"])

    def y_overlap_ratio(a: Dict[str, Any], b: Dict[str, Any]) -> float:
        ov = max(0.0, min(a["y2"], b["y2"]) - max(a["y1"], b["y1"]))
        return ov / min(a["h"], b["h"])

    def is_connected_double(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
        """
        Проверяет, образуют ли два бабла физически соприкасающийся/пересекающийся сдвоенный бабл
        (включая диагональные сдвоенные баблы, сдвинутые вниз и влево/вправо).
        """
        x_gap = max(a["x1"], b["x1"]) - min(a["x2"], b["x2"])
        y_gap = max(a["y1"], b["y1"]) - min(a["y2"], b["y2"])
        # Либо прямое 2D-пересечение боксов со значительным перекрытием по одной из осей,
        # либо плотное вертикальное касание при наличии горизонтального перекрытия
        if x_gap <= 0.008 and y_overlap_ratio(a, b) >= 0.18 and x_overlap_ratio(a, b) >= 0.05:
            return True
        if y_gap <= 0.008 and x_overlap_ratio(a, b) >= 0.12:
            return True
        return False

    def is_same_col(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
        return (
            x_overlap_ratio(a, b) >= 0.25
            or abs(a["cx"] - b["cx"]) < min(a["w"], b["w"]) * 0.45
            or is_connected_double(a, b)
        )

    # 1. Предварительная сортировка сверху вниз (при равном Y — справа налево)
    sorted_items = sorted(items, key=lambda it: (it["y1"], -it["cx"]))

    # 2. Адаптивная кластеризация в горизонтальные ярусы (bands)
    bands: List[List[Dict[str, Any]]] = []
    assigned_ids = set()

    for it in sorted_items:
        placed = False
        for band in bands:
            same_col = [x for x in band if is_same_col(it, x)]
            left_items = [x for x in band if not is_same_col(it, x) and x["cx"] < it["cx"]]
            right_items = [x for x in band if not is_same_col(it, x) and x["cx"] > it["cx"]]

            can_join = False

            if same_col:
                lowest_col = max(same_col, key=lambda x: x["y2"])
                v_gap = it["y1"] - lowest_col["y2"]
                other_col_items = [x for x in band if x not in same_col]
                band_min_y2 = min(x["y2"] for x in band)

                # Сдвоенный бабл (вертикальный или диагональный)
                is_touching_double_bubble = (
                    v_gap <= 0.008
                    or any(is_connected_double(it, sc) for sc in same_col)
                )

                # Проверка 1: Есть ли СПРАВА от `it` на его уровне высоты еще не распределенный бабл?
                # Поскольку мы идем сверху вниз, любой еще не распределенный бабл справа на той же высоте
                # означает, что `it` и `other_it` образуют новый нижний ряд, который должен начинаться справа!
                has_unassigned_right_peer = any(
                    other_it is not it
                    and id(other_it) not in assigned_ids
                    and not is_same_col(other_it, it)
                    and other_it["cx"] > it["cx"]
                    and y_overlap_ratio(it, other_it) >= 0.30
                    and not any(is_connected_double(other_it, b) for b in band)
                    for other_it in sorted_items
                )

                # Проверка 2: Образует ли `it` параллельный новый ряд с другими колонками снизу?
                has_parallel_next_row = bool(other_col_items) and any(
                    other_it is not it
                    and id(other_it) not in assigned_ids
                    and not is_same_col(other_it, it)
                    and y_overlap_ratio(it, other_it) >= 0.35
                    and other_it["y1"] >= band_min_y2 - 0.015
                    and all(y_overlap_ratio(other_it, oc) < 0.25 for oc in other_col_items)
                    and not any(is_connected_double(other_it, oc) for oc in other_col_items)
                    for other_it in sorted_items
                )

                if is_touching_double_bubble:
                    can_join = True
                elif (
                    v_gap <= min(0.045, lowest_col["h"] * 0.40)
                    and not has_unassigned_right_peer
                    and not has_parallel_next_row
                ):
                    can_join = True
            else:
                if not left_items:
                    # Случай А: Новый бабл ЛЕВЕЕ всех текущих баблов яруса.
                    # Сравниваем его с ВЕРХНИМ (опорным) баблом ближайшей правой колонки,
                    # чтобы нижний хвост сдвоенного бабла (например, 5 в 4+5) не затягивал далекие нижние баблы слева.
                    nearest_right = min(right_items, key=lambda x: x["cx"] - it["cx"]) if right_items else band[0]
                    nr_col = [x for x in band if is_same_col(x, nearest_right)]
                    anchor_right = min(nr_col, key=lambda x: x["y1"]) if nr_col else nearest_right

                    # Опорные (верхние) элементы всех колонок яруса
                    top_anchors = [
                        min([y for y in band if is_same_col(y, x)], key=lambda z: z["y1"])
                        for x in band
                    ]
                    core_cy = sum(a["cy"] for a in top_anchors) / len(top_anchors)

                    # Также проверяем, нет ли справа под текущим ярусом нераспределенного бабла, с которым `it` выровнен сильнее
                    better_unassigned_right = any(
                        other_it is not it
                        and id(other_it) not in assigned_ids
                        and other_it["cx"] > it["cx"]
                        and y_overlap_ratio(it, other_it) > y_overlap_ratio(it, anchor_right) + 0.20
                        for other_it in sorted_items
                    )

                    if not better_unassigned_right and (
                        y_overlap_ratio(it, anchor_right) >= 0.28
                        or abs(it["cy"] - anchor_right["cy"]) < 0.060
                        or abs(it["cy"] - core_cy) < 0.055
                    ):
                        can_join = True
                else:
                    # Случай Б: В ярусе уже есть баблы ЛЕВЕЕ текущего (новый бабл ниже и правее).
                    min_left_ov = min(y_overlap_ratio(it, lx) for lx in left_items)
                    max_cy_diff = max(abs(it["cy"] - lx["cy"]) for lx in left_items)
                    bridged_by_right = (
                        bool(right_items)
                        and max(y_overlap_ratio(it, rx) for rx in right_items) >= 0.35
                        and it["y1"] <= max(lx["y2"] for lx in left_items) + 0.02
                    )
                    if min_left_ov >= 0.38 or max_cy_diff < 0.055 or bridged_by_right:
                        can_join = True

            if can_join:
                band.append(it)
                assigned_ids.add(id(it))
                placed = True
                break

        if not placed:
            bands.append([it])
            assigned_ids.add(id(it))

    # 3. Внутри каждого яруса группируем баблы в вертикальные колонки / связки спикеров:
    #    - Колонки сортируются СПРАВА НАЛЕВО (по координате X верхнего опорного бабла колонки)
    #    - Внутри каждой колонки баблы сортируются СВЕРХУ ВНИЗ
    ordered_items: List[Dict[str, Any]] = []
    for band in bands:
        band_by_x = sorted(band, key=lambda x: (-x["cx"], x["y1"]))
        columns: List[List[Dict[str, Any]]] = []

        for it in band_by_x:
            placed_col = False
            for col in columns:
                if any(is_same_col(it, c) for c in col):
                    col.append(it)
                    placed_col = True
                    break
            if not placed_col:
                columns.append([it])

        # Сортируем колонки справа налево по среднему X (с приоритетом верхнего элемента связки)
        columns.sort(key=lambda col: -(min(c, key=lambda z: z["y1"])["cx"] * 0.6 + (sum(c["cx"] for c in col) / len(col)) * 0.4))

        for col in columns:
            col.sort(key=lambda c: (c["y1"], -c["cx"]))
            ordered_items.extend(col)

    return ordered_items


def _find_best_gutter_cut(
    gray_img: np.ndarray,
    items: List[Dict[str, Any]],
    ry1: int,
    ry2: int,
    rx1: int,
    rx2: int,
    axis: str,
) -> Optional[int]:
    """
    Ищет сквозную белую межкадровую канавку (gutter) вдоль оси ('h' или 'v'):
    - Устойчив к баблам, чьи края слегка выступают за рамку кадра в межкадровую канавку:
      запрещает резать только ядро каждого бабла (22%..78%) и зоны пересечения сдвоенных баблов,
      а при оценке белизны канавки маскирует выступающие за рамку верхушки/хвосты одиночных баблов.
    """
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

        # 1. Защищаем ядро каждого бабла (22%..78% высоты), чтобы никогда не разрезать бабл пополам,
        #    но позволить канавке пройти, если край бабла (до 22%) торчит за рамку кадра в белую канавку.
        forbidden = np.zeros(img_h, dtype=bool)
        for it in items:
            core_y1 = int((it["y1"] + it["h"] * 0.22) * img_h)
            core_y2 = int((it["y2"] - it["h"] * 0.22) * img_h)
            if core_y2 > core_y1:
                forbidden[max(0, core_y1):min(img_h, core_y2)] = True

        # 2. Дополнительно защищаем зоны пересечения/касания сдвоенных баблов, чтобы не разрезать их связку
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                x_ov = max(0.0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"])) / min(a["w"], b["w"])
                y_gap = max(a["y1"], b["y1"]) - min(a["y2"], b["y2"])
                if x_ov >= 0.08 and y_gap <= 0.012:
                    join_y1 = int(min(a["cy"], b["cy"]) * img_h)
                    join_y2 = int(max(a["cy"], b["cy"]) * img_h)
                    forbidden[max(0, join_y1):min(img_h, join_y2)] = True

        # 3. Копируем полосу изображения и маскируем (делаем белыми) выступающие края баблов вне их ядер,
        #    чтобы один торчащий в канавку бабл (как #3 на скрине 3 или #6 на скрине 1) не портил детекцию белой канавки.
        roi_strip = gray_img[min_c:max_c + 1, content_x1:content_x2].copy()
        if roi_strip.size == 0:
            return None

        for it in items:
            bx1 = max(0, int(it["x1"] * img_w) - content_x1 - 3)
            bx2 = min(content_x2 - content_x1, int(it["x2"] * img_w) - content_x1 + 3)
            if bx2 <= bx1:
                continue
            # Верхняя и нижняя выступающие кромки (0..22% и 78..100%)
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

    else:  # axis == 'v'
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

        # Защищаем горизонтально пересекающиеся сдвоенные баблы (например, 4 и 5 на скрине 4 или 6 и 9 на скрине 2)
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
    """
    Рекурсивное разбиение страницы по межкадровым канавкам (Recursive XY-Cut):
    1. Если есть сквозная горизонтальная канавка (H-Cut) -> читаем Верхнюю часть, затем Нижнюю.
    2. Иначе если есть сквозная вертикальная канавка (V-Cut) -> читаем Правую часть, затем Левую.
    3. Внутри каждого неделимого кадра — _sort_region_reading_order().
    """
    if len(items) <= 1 or depth >= 6:
        return items

    img_h, img_w = gray_img.shape[:2]

    # Шаг 1. Пробуем горизонтальный разрез (H-Cut: сверху вниз)
    cut_y = _find_best_gutter_cut(gray_img, items, ry1, ry2, rx1, rx2, axis="h")
    if cut_y is not None:
        top_items = [it for it in items if it["cy"] * img_h < cut_y]
        bot_items = [it for it in items if it["cy"] * img_h >= cut_y]
        if top_items and bot_items:
            return (
                _partition_and_sort_xy(gray_img, top_items, ry1, cut_y, rx1, rx2, depth + 1)
                + _partition_and_sort_xy(gray_img, bot_items, cut_y, ry2, rx1, rx2, depth + 1)
            )

    # Шаг 2. Пробуем вертикальный разрез (V-Cut: справа налево)
    cut_x = _find_best_gutter_cut(gray_img, items, ry1, ry2, rx1, rx2, axis="v")
    if cut_x is not None:
        right_items = [it for it in items if it["cx"] * img_w >= cut_x]
        left_items = [it for it in items if it["cx"] * img_w < cut_x]
        if right_items and left_items:
            return (
                _partition_and_sort_xy(gray_img, right_items, ry1, ry2, cut_x, rx2, depth + 1)
                + _partition_and_sort_xy(gray_img, left_items, ry1, ry2, rx1, cut_x, depth + 1)
            )

    # Шаг 3. Листовой регион (отдельный кадр или бесшовная область) — сортируем топологически
    return _sort_region_reading_order(items)


def sort_manga_reading_order(
    boxes: List[Dict[str, Any]],
    gray_img: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    """
    Гибридная топологическая сортировка бабблов манги:
    - Если передан `gray_img`, сначала разделяет страницу по сквозным межкадровым канавкам (XY-Cut)
      с маскированием выступающих за рамку краев баблов.
    - Внутри каждого кадра выполняет двухфазную ряд-колоночную сортировку с поддержкой
      вертикальных и диагональных сдвоенных баблов.
    """
    if len(boxes) <= 1:
        for i, b in enumerate(boxes):
            b["order_index"] = i + 1
        return boxes

    items: List[Dict[str, Any]] = []
    for b in boxes:
        x1 = float(b["x"])
        y1 = float(b["y"])
        w = max(0.01, float(b["width"]))
        h = max(0.01, float(b["height"]))
        items.append({
            "orig": b,
            "x1": x1,
            "y1": y1,
            "x2": x1 + w,
            "y2": y1 + h,
            "w": w,
            "h": h,
            "cx": x1 + w * 0.5,
            "cy": y1 + h * 0.5,
        })

    if gray_img is not None and gray_img.ndim == 2 and gray_img.shape[0] > 40 and gray_img.shape[1] > 40:
        img_h, img_w = gray_img.shape[:2]
        ordered_items = _partition_and_sort_xy(gray_img, items, 0, img_h, 0, img_w, depth=0)
    else:
        ordered_items = _sort_region_reading_order(items)

    final_ordered = [it["orig"] for it in ordered_items]
    for i, item in enumerate(final_ordered):
        item["order_index"] = i + 1

    return final_ordered


def expand_box_to_bubble(
    gray_img: np.ndarray,
    orig_x1: int,
    orig_y1: int,
    orig_x2: int,
    orig_y2: int,
    other_boxes: List[Tuple[int, int, int, int]] = None
) -> Tuple[int, int, int, int]:
    """
    Деликатное лучевое расширение:
    Мягко раздвигает бокс в стороны до черных стенок бабла.
    ГАРАНТИЯ: Итоговый бокс НИКОГДА не может стать уже или меньше исходного бокса от нейросети.
    """
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

        # 1. ЛУЧ ВЛЕВО
        left_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x1 - dx
            if cur_x <= hard_limit_left:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.mean(col < 130) > 0.25 or np.mean(col) < 185:
                break
            left_expand = dx

        # 2. ЛУЧ ВПРАВО
        right_expand = 0
        for dx in range(1, max_expand_x + 1):
            cur_x = x2 + dx
            if cur_x >= hard_limit_right:
                break
            col = gray_img[y_slice_start:y_slice_end, cur_x]
            if np.mean(col < 130) > 0.25 or np.mean(col) < 185:
                break
            right_expand = dx

        # 3. ЛУЧ ВВЕРХ
        top_expand = 0
        for dy in range(1, max_expand_y + 1):
            cur_y = y1 - dy
            if cur_y <= hard_limit_top:
                break
            row_pix = gray_img[cur_y, x_slice_start:x_slice_end]
            if np.mean(row_pix < 130) > 0.25 or np.mean(row_pix) < 185:
                break
            top_expand = dy

        # 4. ЛУЧ ВНИЗ
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


def detect_and_filter_bubbles(image: Image.Image, model_name: str = "yolo_manga.pt") -> List[Dict[str, Any]]:
    yolo = ml.get_yolo(model_name)
    if yolo is None:
        raise RuntimeError(f"Модель YOLO ({model_name}) не загружена")

    # Диагностика классов в консоли
    model_classes = getattr(yolo, "names", {})
    logger.info(f"[YOLO Детектор] Запуск модели '{model_name}'. Зарегистрированные классы модели: {model_classes}")

    img_width, img_height = image.size

    with torch.inference_mode():
        results = yolo.predict(image, conf=0.25, verbose=False)
        raw_items = []
        for box in results[0].boxes:
            xyxy = box.xyxy[0].tolist()
            cls_id = int(box.cls[0].item()) if (box.cls is not None and len(box.cls) > 0) else 0
            raw_items.append((xyxy, cls_id))

    del results

    # Фильтр: исключаем дублирующие внешние рамки
    filtered_items: List[Tuple[List[float], int]] = []
    for i, (box_a, cls_a) in enumerate(raw_items):
        x1_a, y1_a, x2_a, y2_a = box_a
        is_outer = False

        for j, (box_b, _) in enumerate(raw_items):
            if i == j:
                continue
            x1_b, y1_b, x2_b, y2_b = box_b

            if (x1_a - 15 <= x1_b and y1_a - 15 <= y1_b and
                    x2_a + 15 >= x2_b and y2_a + 15 >= y2_b):
                is_outer = True
                break

        if not is_outer:
            filtered_items.append((box_a, cls_a))

    np_img = np.array(image.convert("RGB"))
    gray_img = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)

    int_boxes: List[Tuple[int, int, int, int, int]] = []
    for box_coords, cls_id in filtered_items:
        x1, y1, x2, y2 = box_coords
        ix1 = int(max(0, x1))
        iy1 = int(max(0, y1))
        ix2 = int(min(img_width, x2))
        iy2 = int(min(img_height, y2))
        if ix2 > ix1 + 4 and iy2 > iy1 + 4:
            int_boxes.append((ix1, iy1, ix2, iy2, cls_id))

    boxes: List[Dict[str, Any]] = []
    plain_coords = [(b[0], b[1], b[2], b[3]) for b in int_boxes]

    for idx, (ix1, iy1, ix2, iy2, cls_id) in enumerate(int_boxes):
        other_boxes = [b for j, b in enumerate(plain_coords) if j != idx]

        # Для обычных баблов и мыслей расширяем к контурам, для SFX/текста оставляем точный бокс
        if cls_id in (0, 1):
            ex1, ey1, ex2, ey2 = expand_box_to_bubble(gray_img, ix1, iy1, ix2, iy2, other_boxes)
        else:
            ex1, ey1, ex2, ey2 = ix1, iy1, ix2, iy2

        px1 = max(0.0, ex1 / img_width)
        py1 = max(0.0, ey1 / img_height)
        px2 = min(1.0, ex2 / img_width)
        py2 = min(1.0, ey2 / img_height)

        boxes.append({
            "x": px1,
            "y": py1,
            "width": max(0.01, px2 - px1),
            "height": max(0.01, py2 - py1),
            "class_id": cls_id,
        })

    boxes = sort_manga_reading_order(boxes, gray_img=gray_img)

    # Лог распределения найденных классов
    counts = Counter(b["class_id"] for b in boxes)
    readable_counts = {model_classes.get(cid, f"Класс {cid}"): count for cid, count in counts.items()}
    logger.info(f"[YOLO Детектор] Найдено объектов: {len(boxes)}. Распределение по классам: {readable_counts}")

    return boxes
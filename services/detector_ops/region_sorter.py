# services/detector_ops/region_sorter.py
# Локальная сортировка баблов внутри региона (полосы и колонки)

from typing import List, Dict, Any


def _sort_region_reading_order(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if len(items) <= 1:
        return items

    def x_overlap_ratio(a: Dict[str, Any], b: Dict[str, Any]) -> float:
        ov = max(0.0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"]))
        return ov / min(a["w"], b["w"])

    def y_overlap_ratio(a: Dict[str, Any], b: Dict[str, Any]) -> float:
        ov = max(0.0, min(a["y2"], b["y2"]) - max(a["y1"], b["y1"]))
        return ov / min(a["h"], b["h"])

    def is_connected_double(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
        x_gap = max(a["x1"], b["x1"]) - min(a["x2"], b["x2"])
        y_gap = max(a["y1"], b["y1"]) - min(a["y2"], b["y2"])
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

    sorted_items = sorted(items, key=lambda it: (it["y1"], -it["cx"]))
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

                is_touching_double_bubble = (
                    v_gap <= 0.008
                    or any(is_connected_double(it, sc) for sc in same_col)
                )

                has_unassigned_right_peer = any(
                    other_it is not it
                    and id(other_it) not in assigned_ids
                    and not is_same_col(other_it, it)
                    and other_it["cx"] > it["cx"]
                    and y_overlap_ratio(it, other_it) >= 0.30
                    and not any(is_connected_double(other_it, b) for b in band)
                    for other_it in sorted_items
                )

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
                    nearest_right = min(right_items, key=lambda x: x["cx"] - it["cx"]) if right_items else band[0]
                    nr_col = [x for x in band if is_same_col(x, nearest_right)]
                    anchor_right = min(nr_col, key=lambda x: x["y1"]) if nr_col else nearest_right

                    top_anchors = [
                        min([y for y in band if is_same_col(y, x)], key=lambda z: z["y1"])
                        for x in band
                    ]
                    core_cy = sum(a["cy"] for a in top_anchors) / len(top_anchors)

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

        columns.sort(key=lambda col: -(min(col, key=lambda z: z["y1"])["cx"] * 0.6 + (sum(c["cx"] for c in col) / len(col)) * 0.4))

        for col in columns:
            col.sort(key=lambda c: (c["y1"], -c["cx"]))
            ordered_items.extend(col)

    return ordered_items

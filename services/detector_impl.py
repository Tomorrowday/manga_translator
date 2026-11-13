# services/detector_impl.py
# Ре-экспорт алгоритмов детекции баблов из пакета services/detector_ops/
#
# Состав пакета:
#   region_sorter.py  — _sort_region_reading_order (локальная сортировка полос и колонок)
#   gutter_cutter.py  — _find_best_gutter_cut, _partition_and_sort_xy (разбиение по белым просекам)
#   reading_order.py  — sort_manga_reading_order
#   box_expander.py   — expand_box_to_bubble (дотягивание рамок до границ овала)
#   yolo_detector.py  — detect_and_filter_bubbles (вызов модели, фильтрация, сборка)

from services.detector_ops import (
    sort_manga_reading_order,
    expand_box_to_bubble,
    detect_and_filter_bubbles,
)

__all__ = [
    "sort_manga_reading_order",
    "expand_box_to_bubble",
    "detect_and_filter_bubbles",
]

# services/page_service_ops/__init__.py
# Ре-экспорт публичных операций сервиса страницы для services/page_service.py
#
# Состав пакета:
#   active_settings.py — get_active_global_settings
#   save_blocks.py     — save_page_blocks_service
#   detect_page.py     — detect_page_bubbles_service
#   clean_page.py      — clean_page_bubbles_service, revert_page_clean_service

from services.page_service_ops.active_settings import get_active_global_settings
from services.page_service_ops.save_blocks import save_page_blocks_service
from services.page_service_ops.detect_page import detect_page_bubbles_service
from services.page_service_ops.clean_page import (
    clean_page_bubbles_service,
    revert_page_clean_service,
)

__all__ = [
    "get_active_global_settings",
    "save_page_blocks_service",
    "detect_page_bubbles_service",
    "clean_page_bubbles_service",
    "revert_page_clean_service",
]

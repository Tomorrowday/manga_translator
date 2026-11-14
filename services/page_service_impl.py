# services/page_service_impl.py
# Ре-экспорт операций сервиса страницы из пакета services/page_service_ops/
#
# Состав пакета:
#   active_settings.py — get_active_global_settings
#   save_blocks.py     — save_page_blocks_service
#   detect_page.py     — detect_page_bubbles_service
#   clean_page.py      — clean_page_bubbles_service, revert_page_clean_service

from services.page_service_ops import (
    get_active_global_settings,
    save_page_blocks_service,
    detect_page_bubbles_service,
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

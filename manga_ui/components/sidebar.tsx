// manga_ui/components/sidebar.tsx
/**
 * Контракт боковой панели (Explorer проектов, глав и страниц с управлением).
 * Реализация: manga_ui/components/sidebar_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types, @/lib/api,
 *                         @/components/project-modal, @/components/sidebar/sidebar-modals
 */

import type { PageItem, PageStatus } from "@/lib/types"

export interface SidebarProps {
  currentPageId: number | null
  activePageUpdate?: { id: number; status: PageStatus; clean_path?: string } | null
  refreshTrigger?: number
  onSelectPage: (page: PageItem) => void
  onActiveChapterChange?: (pages: PageItem[]) => void
  onChapterDeleted?: (chapterId: number) => void
  onTitleSelected?: (titleId: number, defaultFontSize?: number) => void
}

export { Sidebar } from "./sidebar_impl"
// manga_ui/components/batch-chapter-actions.tsx
/**
 * Контракт панели пакетных операций над всеми страницами главы.
 * Реализация: manga_ui/components/batch-chapter-actions_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types (PageItem, PageStatus, TextBlock),
 *                         @/lib/api, @/lib/typeset (loadImage, bakePageBlob, mapDbBlockToTextBlock)
 */

import type { PageItem, PageStatus } from "@/lib/types"

export interface BatchChapterActionsProps {
  pages: PageItem[]
  currentPageId: number | null
  titleDefaultFontSize?: number
  onSaveCurrentPage?: () => Promise<void>
  onPageStatusUpdate?: (pageId: number, status: PageStatus, cleanPath?: string) => void
  onRefreshCurrent: () => void
  onCompleteBatch?: () => void
}

export type BatchAction = "detect" | "clean" | "translate" | "export" | "script-export" | "script-import"

export interface BatchProgress {
  action: BatchAction
  done: number
  total: number
  label: string
}

export { BatchChapterActions } from "./batch-chapter-actions_impl"
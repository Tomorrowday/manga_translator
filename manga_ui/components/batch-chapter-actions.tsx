// manga_ui/components/batch-chapter-actions.tsx
/**
 * Контракт панели пакетных операций над всеми страницами главы.
 * Реализация: manga_ui/components/batch-chapter-actions_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types (PageItem, PageStatus, TextBlock),
 *                         @/lib/api, @/lib/typeset (loadImage, bakePageBlob, mapDbBlockToTextBlock)
 */

import type { ChangeEvent, RefObject } from "react"
import type { PageItem, PageStatus } from "@/lib/types"

export type BatchAction = "detect" | "clean" | "translate" | "export" | "script-export" | "script-import"

export interface BatchProgress {
  action: BatchAction
  done: number
  total: number
  label: string
}

/**
 * Внешний контроллер пакетных действий главы.
 * Позволяет поднять `useBatchChapterActions` в родителя (MangaTranslator)
 * и использовать одни и те же методы и в панели, и в глобальных хоткеях.
 */
export interface BatchChapterActionsController {
  progress: BatchProgress | null
  justFinished: BatchAction | null
  fileInputRef: RefObject<HTMLInputElement | null>
  isRunning: boolean
  percent: number
  detectAll: () => void
  cleanChapter: () => void
  translateChapter: () => Promise<void>
  exportAll: () => Promise<void>
  handleExportScript: () => Promise<void>
  handleImportClick: () => Promise<void>
  handleImportScriptFile: (e: ChangeEvent<HTMLInputElement>) => Promise<void>
}

export interface BatchChapterActionsProps {
  pages: PageItem[]
  currentPageId: number | null
  titleDefaultFontSize?: number
  onSaveCurrentPage?: () => Promise<void>
  onPageStatusUpdate?: (pageId: number, status: PageStatus, cleanPath?: string) => void
  onRefreshCurrent: () => void
  onCompleteBatch?: () => void
  /** Если передан, панель использует его вместо собственного вызова `useBatchChapterActions` */
  controller?: BatchChapterActionsController
}

export { BatchChapterActions } from "./batch-chapter-actions_impl"
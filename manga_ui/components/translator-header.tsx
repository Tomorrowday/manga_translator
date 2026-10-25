// manga_ui/components/translator-header.tsx
/**
 * Контракт шапки редактора (навигация по страницам, кегль тайтла, таймер главы, вызов статистики, сохранение/экспорт).
 * Реализация: manga_ui/components/translator-header_impl.tsx
 */

import type { PageItem } from "@/lib/types"

export interface TranslatorHeaderProps {
  currentPage: PageItem | null
  currentIndex?: number
  totalPages?: number
  currentChapterId?: number | null
  titleFontSize: number
  onTitleFontSizeChange: (newSize: number) => void
  onApplyFontSizeToChapter: () => void
  isApplyingChapterFont: boolean
  isSaving: boolean
  isExporting: boolean
  isExportSuccess: boolean
  isTimerRunning: boolean
  timerSeconds: number
  onStartTimer: () => void
  onStopTimer: () => void
  onOpenFolder: () => void
  onExportPage: () => void
  onSaveBlocks: () => void
  onPrevPage?: () => void
  onNextPage?: () => void
  onOpenHotkeys?: () => void
  onOpenSettings?: () => void
  onOpenStatistics?: () => void
}

export { TranslatorHeader } from "./translator-header_impl"
// manga_ui/components/translator-header.tsx
/**
 * Контракт шапки редактора (навигация по страницам, кегль тайтла, кнопки сохранения/экспорта).
 * Реализация: manga_ui/components/translator-header_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types (PageItem), @/hooks/use-manga-hotkeys
 */

import type { PageItem } from "@/lib/types"

export interface TranslatorHeaderProps {
  currentPage: PageItem | null
  currentIndex?: number
  totalPages?: number
  totalBlocks: number
  translatedCount: number
  titleFontSize: number
  onTitleFontSizeChange: (newSize: number) => void
  onApplyFontSizeToChapter: () => void
  isApplyingChapterFont: boolean
  isSaving: boolean
  isExporting: boolean
  isExportSuccess: boolean
  onOpenFolder: () => void
  onExportPage: () => void
  onSaveBlocks: () => void
  onPrevPage?: () => void
  onNextPage?: () => void
  onOpenHotkeys?: () => void
  onOpenSettings?: () => void
}

export { TranslatorHeader } from "./translator-header_impl"
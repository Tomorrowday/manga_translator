// manga_ui/hooks/use-page-blocks.ts
/**
 * Контракт хука управления текстовыми блоками страницы (сохранение, редактирование, клин).
 * Реализация: manga_ui/hooks/use-page-blocks_impl.ts
 * Зависимости реализации: react, @/lib/types, @/lib/typeset, @/lib/api (savePageBlocks, runSpotClean)
 */

import type { TextBlock, PageItem, PageStatus, TitleSettings } from "@/lib/types"
import { usePageBlocks as usePageBlocksImpl } from "./use-page-blocks_impl"

export interface DrawRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export interface UsePageBlocksReturn {
  textBlocks: TextBlock[]
  setTextBlocks: React.Dispatch<React.SetStateAction<TextBlock[]>>
  textBlocksRef: React.MutableRefObject<TextBlock[]>
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  isSaving: boolean
  isDirtyRef: React.MutableRefObject<boolean>
  saveBlocks: (refreshSpeakers?: boolean) => Promise<void>
  saveBlocksExplicit: (targetPageId: number, blocksToSave: TextBlock[], refreshSpeakers?: boolean) => Promise<void>
  setNewPageBlocks: (newBlocks: TextBlock[]) => void
  clearBlocks: () => void
  updateBlock: (id: string, patch: Partial<TextBlock>) => void
  deleteBlock: (id: string) => void
  moveBlock: (id: string, direction: "up" | "down") => void
  spotCleanBlock: (block: TextBlock, method?: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
  addOrUpdateDrawnBlock: (rect: DrawRect, img: HTMLImageElement, existingId?: string, rotation?: number) => Promise<void>
}

export function usePageBlocks(
  currentPage: PageItem | null,
  globalSettings: TitleSettings,
  onPageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void,
  onRefreshSpeakers: (pageId: number) => void
): UsePageBlocksReturn {
  return usePageBlocksImpl(currentPage, globalSettings, onPageStatusUpdate, onRefreshSpeakers)
}
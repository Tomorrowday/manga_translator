// manga_ui/hooks/use-manga-hotkeys.ts
/**
 * Контракт хуков конфигурации горячих клавиш и глобальной диспетчеризации нажатий.
 * Реализация: manga_ui/hooks/use-manga-hotkeys_impl.ts
 * Зависимости реализации: react (useState, useEffect, useCallback), @/lib/hotkeys, @/lib/types
 */

import type { TextBlock } from "@/lib/types"
import type { HotkeyConfig, HotkeyActionId } from "@/lib/hotkeys"
import {
  useHotkeysConfig as useHotkeysConfigImpl,
  useMangaHotkeys as useMangaHotkeysImpl,
} from "./use-manga-hotkeys_impl"

export interface UseHotkeysConfigReturn {
  hotkeys: HotkeyConfig
  updateHotkey: (action: HotkeyActionId, patch: Partial<HotkeyConfig[HotkeyActionId]>) => void
  resetHotkeys: () => void
}

export interface UseMangaHotkeysProps {
  selectedId: string | null
  textBlocks: TextBlock[]
  defaultFontSize?: number
  onPrevPage: () => void
  onNextPage: () => void
  onSave: () => void
  onUndo?: () => Promise<void> | void
  onRedo?: () => Promise<void> | void
  onToggleViewMode?: () => void
  onToggleTypeset?: () => void
  onToggleJapCheck?: () => void
  onOcrBlock?: (block: TextBlock) => Promise<void> | void
  onSetClass?: (classId: number) => void
  onDeleteBlock: (id: string) => void
  onMoveBlock: (id: string, direction: "up" | "down") => void
  onUpdateBlock: (id: string, patch: Partial<TextBlock>) => void
  onSpotClean?: (block: TextBlock, method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
  onBrushResize?: (delta: number) => void
  onChapterDetectAll?: () => void
  onChapterCleanAll?: () => void
  onChapterExportAll?: () => void
  onChapterExportJson?: () => void
  onChapterImportJson?: () => void
}

export function useHotkeysConfig(): UseHotkeysConfigReturn {
  return useHotkeysConfigImpl()
}

export function useMangaHotkeys(props: UseMangaHotkeysProps): void {
  useMangaHotkeysImpl(props)
}
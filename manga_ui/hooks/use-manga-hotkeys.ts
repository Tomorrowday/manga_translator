// manga_ui/hooks/use-manga-hotkeys.ts
// ГЛОБАЛЬНЫЙ СЛУШАТЕЛЬ ХОТКЕЕВ И РЕАКТИВНЫЙ ХУК КОНФИГУРАЦИИ

import { useEffect, useState, useCallback } from "react"
import type { TextBlock } from "@/lib/types"
import {
  type HotkeyConfig,
  type HotkeyActionId,
  DEFAULT_HOTKEYS,
  HOTKEYS_UPDATED_EVENT,
  loadHotkeys,
  saveHotkeys,
  matchHotkey,
  MANGA_FONTS,
} from "@/lib/hotkeys"

export function useHotkeysConfig() {
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(() => loadHotkeys())

  useEffect(() => {
    const sync = () => setHotkeys(loadHotkeys())
    window.addEventListener(HOTKEYS_UPDATED_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(HOTKEYS_UPDATED_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const updateHotkey = useCallback((action: HotkeyActionId, patch: Partial<HotkeyConfig[HotkeyActionId]>) => {
    setHotkeys((prev) => {
      const next = {
        ...prev,
        [action]: { ...prev[action], ...patch },
      }
      saveHotkeys(next)
      return next
    })
  }, [])

  const resetHotkeys = useCallback(() => {
    saveHotkeys({ ...DEFAULT_HOTKEYS })
    setHotkeys({ ...DEFAULT_HOTKEYS })
  }, [])

  return { hotkeys, updateHotkey, resetHotkeys }
}

interface UseMangaHotkeysProps {
  selectedId: string | null
  textBlocks: TextBlock[]
  defaultFontSize?: number
  onPrevPage: () => void
  onNextPage: () => void
  onSave: () => void
  onToggleViewMode?: () => void
  onDeleteBlock: (id: string) => void
  onMoveBlock: (id: string, direction: "up" | "down") => void
  onUpdateBlock: (id: string, patch: Partial<TextBlock>) => void
  onSpotClean?: (block: TextBlock, method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
  onBrushResize?: (delta: number) => void
}

export function useMangaHotkeys({
  selectedId,
  textBlocks,
  defaultFontSize = 14,
  onPrevPage,
  onNextPage,
  onSave,
  onToggleViewMode,
  onDeleteBlock,
  onMoveBlock,
  onUpdateBlock,
  onSpotClean,
  onBrushResize,
}: UseMangaHotkeysProps) {
  const { hotkeys } = useHotkeysConfig()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем нажатия внутри форм и полей ввода
      const target = e.target as HTMLElement | null
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return
      }

      // 1. Навигация по страницам: Q / E (с поддержкой PageUp / PageDown)
      if (matchHotkey(e, hotkeys.prevPage) || e.code === "PageUp" || (e.altKey && e.code === "ArrowLeft")) {
        e.preventDefault()
        onPrevPage()
        return
      }
      if (matchHotkey(e, hotkeys.nextPage) || e.code === "PageDown" || (e.altKey && e.code === "ArrowRight")) {
        e.preventDefault()
        onNextPage()
        return
      }

      // 2. Сохранение страницы (Ctrl+S / Cmd+S)
      if (matchHotkey(e, hotkeys.savePage)) {
        e.preventDefault()
        onSave()
        return
      }

      // 3. Переключение режима скана (Tab: Original / Clean)
      if (matchHotkey(e, hotkeys.toggleViewMode)) {
        if (onToggleViewMode) {
          e.preventDefault()
          onToggleViewMode()
          return
        }
      }

      // 4. Управление размером кисти стрелками (↑/↓)
      if (matchHotkey(e, hotkeys.brushSizeUp)) {
        if (onBrushResize) {
          e.preventDefault()
          onBrushResize(+4)
          return
        }
      }
      if (matchHotkey(e, hotkeys.brushSizeDown)) {
        if (onBrushResize) {
          e.preventDefault()
          onBrushResize(-4)
          return
        }
      }

      // Все последующие действия требуют активного выбранного бабла
      if (!selectedId) return
      const activeBlock = textBlocks.find((b) => b.id === selectedId)
      if (!activeBlock) return

      // 5. Быстрый выбор шрифтов по цифрам 1..7
      for (const font of MANGA_FONTS) {
        const actionKey = `font${font.index}` as HotkeyActionId
        const binding = hotkeys[actionKey]
        if (binding && matchHotkey(e, binding)) {
          e.preventDefault()
          onUpdateBlock(selectedId, { fontFamily: font.id })
          return
        }
      }

      // 6. Точечный клин (Spot Clean)
      if (matchHotkey(e, hotkeys.spotWhiteDel)) {
        e.preventDefault()
        onSpotClean?.(activeBlock, "white", true)
        return
      }
      if (matchHotkey(e, hotkeys.spotWhite)) {
        e.preventDefault()
        onSpotClean?.(activeBlock, "white", false)
        return
      }
      if (matchHotkey(e, hotkeys.spotLamaDel)) {
        e.preventDefault()
        onSpotClean?.(activeBlock, "lama", true)
        return
      }
      if (matchHotkey(e, hotkeys.spotLama)) {
        e.preventDefault()
        onSpotClean?.(activeBlock, "lama", false)
        return
      }

      // 7. Удаление бабла
      if (matchHotkey(e, hotkeys.deleteBlock)) {
        e.preventDefault()
        onDeleteBlock(selectedId)
        return
      }

      // 8. Перемещение бабла в порядке чтения: A (выше) / D (ниже)
      if (matchHotkey(e, hotkeys.moveOrderUp)) {
        e.preventDefault()
        onMoveBlock(selectedId, "up")
        return
      }
      if (matchHotkey(e, hotkeys.moveOrderDown)) {
        e.preventDefault()
        onMoveBlock(selectedId, "down")
        return
      }

      // 9. Размер шрифта (- / +)
      const currentEffectiveFont = activeBlock.fontSize ?? defaultFontSize
      if (matchHotkey(e, hotkeys.fontSizeDown)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { fontSize: Math.max(8, currentEffectiveFont - 1) })
        return
      }
      if (matchHotkey(e, hotkeys.fontSizeUp)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { fontSize: Math.min(48, currentEffectiveFont + 1) })
        return
      }

      // 10. Форма бабла (R: Овал / Прямоугольник)
      if (matchHotkey(e, hotkeys.toggleShape)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { shape: activeBlock.shape === "ellipse" ? "rect" : "ellipse" })
        return
      }

      // 11. Обводка текста (S)
      if (matchHotkey(e, hotkeys.toggleStroke)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { hasStroke: !activeBlock.hasStroke })
        return
      }

      // 12. Режим отступа (F: Fit / Safe)
      if (matchHotkey(e, hotkeys.togglePadding)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { paddingMode: activeBlock.paddingMode === "fit" ? "safe" : "fit" })
        return
      }

      // 13. Режим переносов (H: Min Hyphens / Normal)
      if (matchHotkey(e, hotkeys.toggleHyphenation)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { minHyphens: !(activeBlock.minHyphens !== false) })
        return
      }

      // 14. Стили текста (B, I, U)
      if (matchHotkey(e, hotkeys.toggleBold)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { isBold: !activeBlock.isBold })
        return
      }
      if (matchHotkey(e, hotkeys.toggleItalic)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { isItalic: !activeBlock.isItalic })
        return
      }
      if (matchHotkey(e, hotkeys.toggleUppercase)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { isUppercase: !activeBlock.isUppercase })
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    hotkeys,
    selectedId,
    textBlocks,
    defaultFontSize,
    onPrevPage,
    onNextPage,
    onSave,
    onToggleViewMode,
    onDeleteBlock,
    onMoveBlock,
    onUpdateBlock,
    onSpotClean,
    onBrushResize,
  ])
}
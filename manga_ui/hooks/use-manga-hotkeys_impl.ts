// manga_ui/hooks/use-manga-hotkeys_impl.ts
// Глобальный слушатель хоткеев с поддержкой Undo/Redo (Ctrl+Z / Ctrl+Y), одиночного OCR [O], проверки японского текста [J] и операций со страницей

import { useEffect, useState, useCallback } from "react"
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
import type { UseHotkeysConfigReturn, UseMangaHotkeysProps } from "./use-manga-hotkeys"

export function useHotkeysConfig(): UseHotkeysConfigReturn {
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
      queueMicrotask(() => {
        saveHotkeys(next)
      })
      return next
    })
  }, [])

  const resetHotkeys = useCallback(() => {
    const next = { ...DEFAULT_HOTKEYS }
    setHotkeys(next)
    queueMicrotask(() => {
      saveHotkeys(next)
    })
  }, [])

  return { hotkeys, updateHotkey, resetHotkeys }
}

export function useMangaHotkeys({
  selectedId,
  textBlocks,
  defaultFontSize = 14,
  onPrevPage,
  onNextPage,
  onSave,
  onUndo,
  onRedo,
  onToggleViewMode,
  onToggleTypeset,
  onToggleJapCheck,
  onOcrBlock,
  onSetClass,
  onDeleteBlock,
  onMoveBlock,
  onUpdateBlock,
  onSpotClean,
  onBrushResize,
  onChapterDetectAll,
  onChapterCleanAll,
  onChapterExportAll,
  onChapterExportJson,
  onChapterImportJson,
}: UseMangaHotkeysProps): void {
  const { hotkeys } = useHotkeysConfig()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return
      }

      // 0. Undo / Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
      const isCtrlOrMeta = e.ctrlKey || e.metaKey
      if (
        matchHotkey(e, hotkeys.redoAction) ||
        (isCtrlOrMeta && e.shiftKey && !e.altKey && e.code === "KeyZ")
      ) {
        if (onRedo) {
          e.preventDefault()
          onRedo()
          return
        }
      }
      if (matchHotkey(e, hotkeys.undoAction)) {
        if (onUndo) {
          e.preventDefault()
          onUndo()
          return
        }
      }

      // 1. Навигация по страницам
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

      // 2. Сохранение страницы
      if (matchHotkey(e, hotkeys.savePage)) {
        e.preventDefault()
        onSave()
        return
      }

      // 3. Переключение режима скана (Tab)
      if (matchHotkey(e, hotkeys.toggleViewMode)) {
        if (onToggleViewMode) {
          e.preventDefault()
          onToggleViewMode()
          return
        }
      }

      // 4. Включение / выключение тайпсета (T)
      if (matchHotkey(e, hotkeys.toggleTypeset)) {
        if (onToggleTypeset) {
          e.preventDefault()
          onToggleTypeset()
          return
        }
      }

      // 5. Включение / выключение японских плашек у баблов (J)
      if (matchHotkey(e, hotkeys.toggleJapCheck)) {
        if (onToggleJapCheck) {
          e.preventDefault()
          onToggleJapCheck()
          return
        }
      }

      // 6. Действия с главой
      if (matchHotkey(e, hotkeys.chapterDetectAll)) {
        e.preventDefault()
        onChapterDetectAll?.()
        return
      }
      if (matchHotkey(e, hotkeys.chapterCleanAll)) {
        e.preventDefault()
        onChapterCleanAll?.()
        return
      }
      if (matchHotkey(e, hotkeys.chapterExportAll)) {
        e.preventDefault()
        onChapterExportAll?.()
        return
      }
      if (matchHotkey(e, hotkeys.chapterExportJson)) {
        e.preventDefault()
        onChapterExportJson?.()
        return
      }
      if (matchHotkey(e, hotkeys.chapterImportJson)) {
        e.preventDefault()
        onChapterImportJson?.()
        return
      }

      // 7. Размер кисти (Стрелки вверх/вниз)
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

      // Все следующие хоткеи требуют выделенного бабла
      if (!selectedId) return
      const activeBlock = textBlocks.find((b) => b.id === selectedId)
      if (!activeBlock) return

      // 8. Одиночный OCR выбранного бабла [O]
      if (matchHotkey(e, hotkeys.ocrBlock)) {
        e.preventDefault()
        if (onOcrBlock) {
          onOcrBlock(activeBlock)
        } else {
          window.dispatchEvent(new CustomEvent("manga-ocr-selected-block", { detail: { blockId: activeBlock.id } }))
        }
        return
      }

      // 9. Смена типа бабла
      if (matchHotkey(e, hotkeys.setClassBubble)) {
        e.preventDefault()
        onSetClass?.(0) // Бабл
        return
      }
      if (matchHotkey(e, hotkeys.setClassThought)) {
        e.preventDefault()
        onSetClass?.(1) // Мысли
        return
      }
      if (matchHotkey(e, hotkeys.setClassText)) {
        e.preventDefault()
        onSetClass?.(2) // Текст
        return
      }
      if (matchHotkey(e, hotkeys.setClassSfx)) {
        e.preventDefault()
        onSetClass?.(3) // SFX (Звук по F4)
        return
      }

      // 10. Выбор шрифтов 1..7
      for (const font of MANGA_FONTS) {
        const actionKey = `font${font.index}` as HotkeyActionId
        const binding = hotkeys[actionKey]
        if (binding && matchHotkey(e, binding)) {
          e.preventDefault()
          onUpdateBlock(selectedId, { fontFamily: font.id })
          return
        }
      }

      // 11. Точечный клин
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

      // 12. Удаление бабла
      if (matchHotkey(e, hotkeys.deleteBlock)) {
        e.preventDefault()
        onDeleteBlock(selectedId)
        return
      }

      // 13. Порядок чтения
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

      // 14. Размер шрифта
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

      // 15. Геометрия и стили
      if (matchHotkey(e, hotkeys.toggleShape)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { shape: activeBlock.shape === "ellipse" ? "rect" : "ellipse" })
        return
      }
      if (matchHotkey(e, hotkeys.toggleStroke)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { hasStroke: !activeBlock.hasStroke })
        return
      }
      if (matchHotkey(e, hotkeys.togglePadding)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { paddingMode: activeBlock.paddingMode === "fit" ? "safe" : "fit" })
        return
      }
      if (matchHotkey(e, hotkeys.toggleHyphenation)) {
        e.preventDefault()
        onUpdateBlock(selectedId, { minHyphens: !(activeBlock.minHyphens !== false) })
        return
      }
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
    onUndo,
    onRedo,
    onToggleViewMode,
    onToggleTypeset,
    onToggleJapCheck,
    onOcrBlock,
    onSetClass,
    onDeleteBlock,
    onMoveBlock,
    onUpdateBlock,
    onSpotClean,
    onBrushResize,
    onChapterDetectAll,
    onChapterCleanAll,
    onChapterExportAll,
    onChapterExportJson,
    onChapterImportJson,
  ])
}
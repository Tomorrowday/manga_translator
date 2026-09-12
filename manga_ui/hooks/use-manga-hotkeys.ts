// hooks/use-manga-hotkeys.ts
// Глобальный слушатель и маршрутизатор горячих клавиш редактора манги

import { useEffect } from "react"
import type { TextBlock } from "@/lib/types"
import { BUBBLE_HOTKEYS } from "@/lib/hotkeys"

interface UseMangaHotkeysProps {
  selectedId: string | null
  textBlocks: TextBlock[]
  onPrevPage: () => void
  onNextPage: () => void
  onSave: () => void
  onDeleteBlock: (id: string) => void
  onMoveBlock: (id: string, direction: "up" | "down") => void
  onUpdateBlock: (id: string, patch: Partial<TextBlock>) => void
}

export function useMangaHotkeys({
  selectedId,
  textBlocks,
  onPrevPage,
  onNextPage,
  onSave,
  onDeleteBlock,
  onMoveBlock,
  onUpdateBlock,
}: UseMangaHotkeysProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем нажатия внутри текстовых полей ввода
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return
      }

      const code = e.code
      const key = e.key

      // 1. Навигация по страницам главы
      if (code === "PageUp" || (e.altKey && code === "ArrowLeft")) {
        e.preventDefault()
        onPrevPage()
        return
      }
      if (code === "PageDown" || (e.altKey && code === "ArrowRight")) {
        e.preventDefault()
        onNextPage()
        return
      }

      // 2. Сохранение (Ctrl+S / Cmd+S / русская Ы)
      if ((e.ctrlKey || e.metaKey) && (code === "KeyS" || key.toLowerCase() === "s" || key.toLowerCase() === "ы")) {
        e.preventDefault()
        onSave()
        return
      }

      // Все последующие действия требуют активного выбранного бабла
      if (!selectedId) return
      const activeBlock = textBlocks.find((b) => b.id === selectedId)
      if (!activeBlock) return

      // 3. Удаление бабла
      if (code === "Delete" || code === "Backspace" || key === "Delete" || key === "Backspace") {
        e.preventDefault()
        onDeleteBlock(selectedId)
        return
      }

      // 4. Изменение порядка чтения ([ / ])
      if (code === BUBBLE_HOTKEYS.moveOrderUp.code || (e.altKey && code === "ArrowUp")) {
        e.preventDefault()
        onMoveBlock(selectedId, "up")
        return
      }
      if (code === BUBBLE_HOTKEYS.moveOrderDown.code || (e.altKey && code === "ArrowDown")) {
        e.preventDefault()
        onMoveBlock(selectedId, "down")
        return
      }

      // 5. Размер шрифта (- / +)
      if (key === "-" || key === "_" || code === "NumpadSubtract") {
        e.preventDefault()
        const curFont = activeBlock.fontSize || Math.max(11, Math.min(16, Math.round(11 + (activeBlock.height || 0.1) * 22)))
        onUpdateBlock(selectedId, { fontSize: Math.max(8, curFont - 1) })
        return
      }
      if (key === "+" || key === "=" || code === "NumpadAdd") {
        e.preventDefault()
        const curFont = activeBlock.fontSize || Math.max(11, Math.min(16, Math.round(11 + (activeBlock.height || 0.1) * 22)))
        onUpdateBlock(selectedId, { fontSize: Math.min(36, curFont + 1) })
        return
      }

      // 6. Форма бабла (R: Овал / Прямоугольник)
      if (code === BUBBLE_HOTKEYS.toggleShape.code) {
        e.preventDefault()
        onUpdateBlock(selectedId, { shape: activeBlock.shape === "ellipse" ? "rect" : "ellipse" })
        return
      }

      // 7. Белая обводка текста (S)
      if (code === BUBBLE_HOTKEYS.toggleStroke.code && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onUpdateBlock(selectedId, { hasStroke: !activeBlock.hasStroke })
        return
      }

      // 8. Режим отступа (F: Fit / Safe)
      if (code === BUBBLE_HOTKEYS.togglePadding.code) {
        e.preventDefault()
        onUpdateBlock(selectedId, { paddingMode: activeBlock.paddingMode === "fit" ? "safe" : "fit" })
        return
      }

      // 9. Режим минимизации переносов (H: Min Hyphens / Normal)
      if (code === BUBBLE_HOTKEYS.toggleHyphenation.code && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const curVal = activeBlock.minHyphens !== false
        onUpdateBlock(selectedId, { minHyphens: !curVal })
        return
      }

      // 10. Жирный шрифт (B)
      if (code === BUBBLE_HOTKEYS.toggleBold.code && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onUpdateBlock(selectedId, { isBold: !activeBlock.isBold })
        return
      }

      // 11. Курсив (I)
      if (code === BUBBLE_HOTKEYS.toggleItalic.code && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onUpdateBlock(selectedId, { isItalic: !activeBlock.isItalic })
        return
      }

      // 12. Все заглавные (U)
      if (code === BUBBLE_HOTKEYS.toggleUppercase.code) {
        e.preventDefault()
        onUpdateBlock(selectedId, { isUppercase: !activeBlock.isUppercase })
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedId, textBlocks, onPrevPage, onNextPage, onSave, onDeleteBlock, onMoveBlock, onUpdateBlock])
}
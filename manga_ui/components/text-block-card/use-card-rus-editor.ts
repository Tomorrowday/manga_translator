// manga_ui/components/text-block-card/use-card-rus-editor.ts
// Расчёт видимых строк русского перевода, Enter с ручным переносом и сброс этих переносов

"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import type { TextBlock } from "@/lib/types"
import {
  layoutBubbleTextLines,
  reflowFromManualLines,
  joinLinesRemovingSoftHyphens,
} from "@/lib/typeset"

let cardPreviewCanvas: HTMLCanvasElement | null = null

export interface UseCardRusEditorProps {
  block: TextBlock
  defaultFontSize?: number
  autoOvalBubble?: boolean
  onChange: (patch: Partial<TextBlock>) => void
}

export interface UseCardRusEditorReturn {
  renderedLines: string[]
  localRusText: string
  setLocalRusText: React.Dispatch<React.SetStateAction<string>>
  rusTextareaRef: React.RefObject<HTMLTextAreaElement | null>
  isFocusedRus: boolean
  setIsFocusedRus: React.Dispatch<React.SetStateAction<boolean>>
  snapshotLinesRef: React.RefObject<string[]>
  saveStorageTextToBlock: (storageText: string) => void
  handleRusKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  handleClearManualBreaks: (e: React.MouseEvent) => void
  hasManualNewlines: boolean
  rusRows: number
}

export function useCardRusEditor({
  block,
  defaultFontSize = 14,
  autoOvalBubble = true,
  onChange,
}: UseCardRusEditorProps): UseCardRusEditorReturn {
  const [isFocusedRus, setIsFocusedRus] = useState(false)
  const [localRusText, setLocalRusText] = useState(block.rusText || "")

  const rusTextareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshotLinesRef = useRef<string[]>([])

  const renderedLines = useMemo(() => {
    if (typeof document === "undefined") return (block.rusText || "").split(/\r?\n/)
    if (!cardPreviewCanvas) {
      cardPreviewCanvas = document.createElement("canvas")
    }
    const ctx = cardPreviewCanvas.getContext("2d")
    const raw = (block.rusText || "").trim()
    if (!ctx || !raw) return []

    const imgEl = document.querySelector<HTMLImageElement>("img[alt='Manga page']")
    const naturalW = imgEl?.naturalWidth || 1100
    const naturalH = imgEl?.naturalHeight || 1600

    const baseSize = block.fontSize || defaultFontSize
    const masterFontSize = Math.round(baseSize * (naturalH / 1200))
    const masterBoxPixelW = block.width * naturalW
    const masterBoxPixelH = block.height * naturalH
    const currentFont = block.fontFamily || "v_CCFaceFront"

    const res = layoutBubbleTextLines(
      ctx,
      raw,
      masterBoxPixelW,
      masterBoxPixelH,
      masterFontSize,
      currentFont,
      block.shape || "rect",
      block.paddingMode || "safe",
      block.isBold,
      block.isItalic,
      block.minHyphens !== false
    )
    return res.lines
  }, [
    block.rusText,
    block.width,
    block.height,
    block.fontSize,
    block.fontFamily,
    block.shape,
    block.paddingMode,
    block.isBold,
    block.isItalic,
    block.minHyphens,
    defaultFontSize,
  ])

  useEffect(() => {
    if (!isFocusedRus) {
      const displayStr = renderedLines.length > 0 ? renderedLines.join("\n") : block.rusText || ""
      setLocalRusText(displayStr)
      snapshotLinesRef.current = [...renderedLines]
    }
  }, [renderedLines, block.rusText, isFocusedRus])

  const currentClassId = block.class_id ?? 0

  const saveStorageTextToBlock = (storageText: string) => {
    const patch: Partial<TextBlock> = {
      rusText: storageText,
      status: storageText.trim() ? "translated" : block.japText ? "ocr-done" : "new",
    }
    if (currentClassId === 0 && autoOvalBubble && !block.shape) {
      patch.shape = storageText.trim().length > 0 ? "ellipse" : "rect"
    } else if (
      currentClassId === 0 &&
      autoOvalBubble &&
      storageText.trim().length > 0 &&
      block.shape === "rect" &&
      !block.rusText
    ) {
      patch.shape = "ellipse"
    }
    onChange(patch)
  }

  const handleRusKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const ta = rusTextareaRef.current
      if (ta && cardPreviewCanvas) {
        e.preventDefault()
        const start = ta.selectionStart ?? localRusText.length
        const end = ta.selectionEnd ?? localRusText.length
        const before = localRusText.slice(0, start).trimEnd()
        const after = localRusText.slice(end).trimStart()

        const nextRaw = `${before}\n${after}`
        const storageText = reflowFromManualLines(snapshotLinesRef.current, nextRaw)

        const ctx = cardPreviewCanvas.getContext("2d")
        const imgEl = document.querySelector<HTMLImageElement>("img[alt='Manga page']")
        const naturalW = imgEl?.naturalWidth || 1100
        const naturalH = imgEl?.naturalHeight || 1600
        const baseSize = block.fontSize || defaultFontSize
        const masterFontSize = Math.round(baseSize * (naturalH / 1200))

        if (ctx) {
          const res = layoutBubbleTextLines(
            ctx,
            storageText,
            block.width * naturalW,
            block.height * naturalH,
            masterFontSize,
            block.fontFamily || "v_CCFaceFront",
            block.shape || "rect",
            block.paddingMode || "safe",
            block.isBold,
            block.isItalic,
            block.minHyphens !== false
          )
          const formattedVisible = res.lines.join("\n")
          snapshotLinesRef.current = [...res.lines]
          setLocalRusText(formattedVisible)
          saveStorageTextToBlock(storageText)

          const newCursorPos = Math.min(formattedVisible.length, before.length + 1)
          requestAnimationFrame(() => {
            if (rusTextareaRef.current) {
              rusTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
            }
          })
          return
        }
      }
    }
  }

  const handleClearManualBreaks = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!block.rusText) return
    const rawLines = block.rusText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)

    const cleaned = joinLinesRemovingSoftHyphens(rawLines)
    saveStorageTextToBlock(cleaned)
  }

  const hasManualNewlines = Boolean(block.rusText && /\r?\n/.test(block.rusText))
  const rusRows = Math.min(6, Math.max(1, localRusText.split(/\r?\n/).length))

  return {
    renderedLines,
    localRusText,
    setLocalRusText,
    rusTextareaRef,
    isFocusedRus,
    setIsFocusedRus,
    snapshotLinesRef,
    saveStorageTextToBlock,
    handleRusKeyDown,
    handleClearManualBreaks,
    hasManualNewlines,
    rusRows,
  }
}

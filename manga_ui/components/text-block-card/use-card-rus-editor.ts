// manga_ui/components/text-block-card/use-card-rus-editor.ts
// Расчёт видимых строк русского перевода, Enter с ручным переносом и сброс этих переносов

"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import type { TextBlock } from "@/lib/types"
import {
  layoutBubbleTextLines,
  reflowFromManualLines,
  joinLinesRemovingSoftHyphens,
  hasManualLineBreaks,
  stripForcedSingleLineMarker,
  FORCED_SINGLE_LINE_MARKER,
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
  beginRusEditSession: () => void
  buildRusStorageText: (value: string) => string
  handleRusKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  handleRusTextChange: (value: string) => void
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
  const [localRusText, setLocalRusText] = useState(() => stripForcedSingleLineMarker(block.rusText))

  const rusTextareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshotLinesRef = useRef<string[]>([])
  // Был ли блок ручным до начала правки и менял ли пользователь разбивку строк.
  const wasManualBeforeEditRef = useRef(false)
  const hadForcedSingleLineRef = useRef(false)
  const userTouchedBreaksRef = useRef(false)
  const handledPageImageRef = useRef<HTMLImageElement | null>(null)
  const [pageImageTick, setPageImageTick] = useState(0)

  // Скан страницы может быть ещё не загружен в момент первого расчёта строк.
  // Дожидаемся события load у img[alt='Manga page'], чтобы renderedLines
  // пересчитались с реальными naturalWidth / naturalHeight вместо дефолтных 1100x1600.
  useEffect(() => {
    if (typeof document === "undefined") return

    const bumpLines = () => setPageImageTick((tick) => tick + 1)
    const imgEl = document.querySelector<HTMLImageElement>("img[alt='Manga page']")
    if (!imgEl) return

    if (imgEl.complete) {
      // Строки могли посчитаться до загрузки скана — форсируем один пересчёт.
      if (handledPageImageRef.current !== imgEl) {
        handledPageImageRef.current = imgEl
        bumpLines()
      }
      return
    }

    const handleLoad = () => {
      handledPageImageRef.current = imgEl
      bumpLines()
    }
    imgEl.addEventListener("load", handleLoad)
    return () => imgEl.removeEventListener("load", handleLoad)
  }, [block.id])

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

    // Маркер однострочности НЕ добавляем: в textarea должен быть только
    // чистый видимый текст, иначе Backspace удаляет невидимый \u2060.
    return [...res.lines]
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
    pageImageTick,
  ])

  useEffect(() => {
    if (!isFocusedRus) {
      const displayStr =
        renderedLines.length > 0
          ? renderedLines.join("\n")
          : stripForcedSingleLineMarker(block.rusText)
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

  // Запоминаем состояние на момент фокуса: какие строки были на скане,
  // был ли блок ручным и был ли он принудительно однострочным.
  const beginRusEditSession = () => {
    snapshotLinesRef.current = [...renderedLines]
    wasManualBeforeEditRef.current = hasManualLineBreaks(block.rusText)
    hadForcedSingleLineRef.current = Boolean(block.rusText?.includes(FORCED_SINGLE_LINE_MARKER))
    userTouchedBreaksRef.current = false
  }

  /**
   * Собирает storage-текст из значения textarea. Если пользователь только
   * исправил символ (число строк не изменилось и Enter/Backspace не трогали
   * переносы), блок остаётся в авто-режиме.
   */
  const buildRusStorageText = (value: string) => {
    const editedLineCount = value.split(/\r?\n/).length
    if (editedLineCount !== snapshotLinesRef.current.length) {
      userTouchedBreaksRef.current = true
    }

    return reflowFromManualLines(snapshotLinesRef.current, value, {
      wasManualBeforeEdit: wasManualBeforeEditRef.current,
      hasUserModifiedLineBreaks: userTouchedBreaksRef.current,
      hadForcedSingleLine: hadForcedSingleLineRef.current,
    })
  }

  // Enter, Backspace и Delete должны работать нативно, как в обычном блокноте.
  // Никакого preventDefault и пересчёта текста здесь быть не должно.
  const handleRusKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      userTouchedBreaksRef.current = true
    }
  }

  // Живое сохранение: пользователь ставит перенос — скан сразу перерисовывается,
  // но содержимое textarea не перезаписывается результатом авто-вёрстки.
  const handleRusTextChange = (value: string) => {
    setLocalRusText(value)
    saveStorageTextToBlock(buildRusStorageText(value))
  }

  const handleClearManualBreaks = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!block.rusText) return
    const rawLines = block.rusText
      .replace(/\u2060/g, "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)

    const cleaned = joinLinesRemovingSoftHyphens(rawLines)
    saveStorageTextToBlock(cleaned)
  }

  const hasManualNewlines = hasManualLineBreaks(block.rusText)
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
    beginRusEditSession,
    buildRusStorageText,
    handleRusKeyDown,
    handleRusTextChange,
    handleClearManualBreaks,
    hasManualNewlines,
    rusRows,
  }
}

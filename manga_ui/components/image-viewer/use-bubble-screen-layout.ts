// manga_ui/components/image-viewer/use-bubble-screen-layout.ts
// Экранная верстка текста бабла: метрики картинки, ожидание шрифтов, расчёт кегля и междустрочного интервала

"use client"

import { useEffect, useMemo, useState } from "react"
import { layoutBubbleTextLines, reflowFromManualLines, FORCED_SINGLE_LINE_MARKER } from "@/lib/typeset"
import type { ReflowOptions } from "@/lib/typeset"
import type { TextBlock } from "@/lib/types"

let previewCanvas: HTMLCanvasElement | null = null

function getPreviewContext(): CanvasRenderingContext2D | null {
  if (!previewCanvas && typeof document !== "undefined") {
    previewCanvas = document.createElement("canvas")
  }
  return previewCanvas?.getContext("2d") ?? null
}

/**
 * Проецирует строки, посчитанные по UPPERCASE-тексту, обратно на исходный
 * регистр. Идём по символам отрисованной строки и синхронно вычитываем
 * соответствующие символы из исходного текста. Вставленные движком мягкие
 * дефисы сохраняются, чтобы ручная правка могла их корректно снять.
 */
function projectLinesToOriginalCase(rawText: string, renderedLines: string[]): string[] | null {
  let pos = 0
  const out: string[] = []

  const skipWhitespace = () => {
    while (pos < rawText.length && /\s/.test(rawText[pos])) pos++
  }

  for (const renderedLine of renderedLines) {
    let lineOut = ""
    let pendingSpace = false

    for (let i = 0; i < renderedLine.length; i++) {
      const ch = renderedLine[i]

      if (/\s/.test(ch)) {
        if (lineOut.length > 0) pendingSpace = true
        continue
      }

      skipWhitespace()

      if (pendingSpace) {
        lineOut += " "
        pendingSpace = false
      }

      if (ch === "-" && rawText[pos] !== "-") {
        // Мягкий слоговой перенос, которого нет в исходном тексте
        lineOut += "-"
        continue
      }

      if (pos >= rawText.length) return null

      const rawCh = rawText[pos]
      if (rawCh.toLowerCase() !== ch.toLowerCase()) return null

      lineOut += rawCh
      pos++
    }

    out.push(lineOut)
  }

  skipWhitespace()
  if (pos < rawText.length) return null

  return out
}

export interface BubbleReflowedState {
  storageText: string
  previewLines: string[]
}

export interface UseBubbleScreenLayoutParams {
  imgElement: HTMLImageElement | null
  box: TextBlock
  currentW: number
  currentH: number
  defaultFontSize: number
}

export interface BubbleScreenLayout {
  screenLines: string[]
  editableLines: string[]
  finalScreenFontSize: number
  finalScreenLineHeight: number
  currentFont: string
  masterBoxPixelH: number
  screenScale: number
  computeReflowedState: (
    snapshotLines: string[],
    rawInput: string,
    options?: ReflowOptions
  ) => BubbleReflowedState
}

export function useBubbleScreenLayout({
  imgElement,
  box,
  currentW,
  currentH,
  defaultFontSize,
}: UseBubbleScreenLayoutParams): BubbleScreenLayout {
  const [imgMetrics, setImgMetrics] = useState({
    naturalW: 1100,
    naturalH: 1600,
    clientH: 1600,
  })
  const [fontsLoadedTick, setFontsLoadedTick] = useState(0)

  useEffect(() => {
    if (!imgElement) return

    const updateMetrics = () => {
      setImgMetrics({
        naturalW: imgElement.naturalWidth || 1100,
        naturalH: imgElement.naturalHeight || 1600,
        clientH: imgElement.clientHeight || imgElement.naturalHeight || 1600,
      })
    }

    updateMetrics()

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(imgElement)
    window.addEventListener("resize", updateMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateMetrics)
    }
  }, [imgElement])

  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        setFontsLoadedTick((t) => t + 1)
      })
    }
  }, [box.fontFamily])

  const naturalH = imgElement?.naturalHeight || imgMetrics.naturalH
  const naturalW = imgElement?.naturalWidth || imgMetrics.naturalW
  const displayH = imgElement?.clientHeight || imgMetrics.clientH

  const padMode = box.paddingMode || "safe"
  const isMinHyphens = box.minHyphens !== false

  const baseSize = box.fontSize || defaultFontSize
  const masterFontSize = Math.round(baseSize * (naturalH / 1200))
  const masterBoxPixelW = currentW * naturalW
  const masterBoxPixelH = currentH * naturalH
  const currentFont = box.fontFamily || "v_CCFaceFront"

  const rawDisplayText = box.rusText || ""
  const displayText = box.isUppercase ? rawDisplayText.toUpperCase() : rawDisplayText

  const { screenLines, editableLines, masterActualFontSize, masterLineHeight } = useMemo(() => {
    const ctx = getPreviewContext()
    if (!ctx || !displayText.trim()) {
      return {
        screenLines: [],
        editableLines: [],
        masterActualFontSize: masterFontSize,
        masterLineHeight: Math.round(masterFontSize * 1.15),
      }
    }

    const res = layoutBubbleTextLines(
      ctx,
      displayText,
      masterBoxPixelW,
      masterBoxPixelH,
      masterFontSize,
      currentFont,
      box.shape || "rect",
      padMode,
      box.isBold,
      box.isItalic,
      isMinHyphens
    )

    let editLines = res.lines
    const rawForEdit = rawDisplayText.split(FORCED_SINGLE_LINE_MARKER).join("")

    if (box.isUppercase && rawForEdit.trim()) {
      // Строки посчитаны по реальной ширине UPPERCASE. Проецируем их обратно
      // на исходный регистр, чтобы переносы в редакторе совпадали со сканом.
      const projected = projectLinesToOriginalCase(rawForEdit, res.lines)
      if (projected && projected.length > 0) {
        editLines = projected
      } else {
        // Редкий фоллбэк: если посимвольное сопоставление не удалось,
        // верстаем исходный регистр отдельно (прежнее поведение).
        const rawRes = layoutBubbleTextLines(
          ctx,
          rawDisplayText,
          masterBoxPixelW,
          masterBoxPixelH,
          masterFontSize,
          currentFont,
          box.shape || "rect",
          padMode,
          box.isBold,
          box.isItalic,
          isMinHyphens
        )
        editLines = rawRes.lines
      }
    }

    // Маркер принудительной однострочности НЕ прокидываем в editableLines:
    // в textarea должен быть только чистый текст. Факт однострочности
    // передаётся в reflowFromManualLines через опции редактора.
    return {
      screenLines: res.lines,
      editableLines: editLines,
      masterActualFontSize: res.actualFontSize,
      masterLineHeight: res.lineHeight,
    }
  }, [
    displayText,
    rawDisplayText,
    masterBoxPixelW,
    masterBoxPixelH,
    masterFontSize,
    currentFont,
    box.shape,
    padMode,
    box.isBold,
    box.isItalic,
    box.isUppercase,
    isMinHyphens,
    fontsLoadedTick,
  ])

  const scale = naturalH > 0 ? displayH / naturalH : 1
  const finalScreenFontSize = Math.max(6, Number((masterActualFontSize * scale).toFixed(2)))
  const finalScreenLineHeight = Math.max(7, Number((masterLineHeight * scale).toFixed(2)))

  const computeReflowedState = (
    snapshotLines: string[],
    rawInput: string,
    options?: ReflowOptions
  ): BubbleReflowedState => {
    const trimmed = rawInput.trim()
    if (!trimmed) return { storageText: "", previewLines: [] }

    const storageText = reflowFromManualLines(snapshotLines, trimmed, options)
    const ctx = getPreviewContext()
    if (!ctx) {
      return { storageText, previewLines: storageText.split("\n") }
    }

    const res = layoutBubbleTextLines(
      ctx,
      storageText,
      masterBoxPixelW,
      masterBoxPixelH,
      masterFontSize,
      currentFont,
      box.shape || "rect",
      padMode,
      box.isBold,
      box.isItalic,
      isMinHyphens
    )

    return {
      storageText,
      previewLines: res.lines,
    }
  }

  return {
    screenLines,
    editableLines,
    finalScreenFontSize,
    finalScreenLineHeight,
    currentFont,
    masterBoxPixelH,
    screenScale: scale,
    computeReflowedState,
  }
}

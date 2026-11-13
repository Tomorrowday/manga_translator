// manga_ui/components/image-viewer/use-bubble-screen-layout.ts
// Экранная верстка текста бабла: метрики картинки, ожидание шрифтов, расчёт кегля и междустрочного интервала

"use client"

import { useEffect, useMemo, useState } from "react"
import { layoutBubbleTextLines, reflowFromManualLines } from "@/lib/typeset"
import type { TextBlock } from "@/lib/types"

let previewCanvas: HTMLCanvasElement | null = null

function getPreviewContext(): CanvasRenderingContext2D | null {
  if (!previewCanvas && typeof document !== "undefined") {
    previewCanvas = document.createElement("canvas")
  }
  return previewCanvas?.getContext("2d") ?? null
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
  computeReflowedState: (snapshotLines: string[], rawInput: string) => BubbleReflowedState
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
    if (box.isUppercase && rawDisplayText.trim()) {
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

  const computeReflowedState = (snapshotLines: string[], rawInput: string): BubbleReflowedState => {
    const trimmed = rawInput.trim()
    if (!trimmed) return { storageText: "", previewLines: [] }

    const storageText = reflowFromManualLines(snapshotLines, trimmed)
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

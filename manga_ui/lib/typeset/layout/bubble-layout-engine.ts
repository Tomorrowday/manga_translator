// manga_ui/lib/typeset/layout/bubble-layout-engine.ts
// Главный движок верстки текста бабла: подбор кегля, учет формы (прямоугольник/овал) и ручных переносов

import { getEllipseWidthAtY } from "./ellipse-geometry"
import { joinLinesRemovingSoftHyphens } from "./compound-words"
import { layoutSegmentOptimal } from "./segment-breaker"
import { FORCED_SINGLE_LINE_MARKER } from "./manual-reflow"

export function layoutBubbleTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxW: number,
  boxH: number,
  fontSize: number,
  fontFamily: string,
  shape: "rect" | "ellipse" = "rect",
  padMode: "safe" | "fit" = "safe",
  isBold?: boolean,
  isItalic?: boolean,
  minHyphens: boolean = true
): { lines: string[]; actualFontSize: number; lineHeight: number } {
  let curSize = Math.max(8, fontSize)
  const isEllipse = shape === "ellipse"
  const widthRatio = padMode === "fit" ? 0.96 : 0.90
  const targetMaxW = boxW * widthRatio

  const hasForcedSingleLineMarker = text.includes(FORCED_SINGLE_LINE_MARKER)
  const displayText = text.split(FORCED_SINGLE_LINE_MARKER).join("")

  // Перенос строки (даже пустой хвост вида "текст\n") или маркер \u2060
  // означают, что пользователь зафиксировал строки вручную.
  const hasAnyNewline = /\r?\n/.test(displayText)

  const rawSegments = displayText
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const isManualLayout = hasAnyNewline || hasForcedSingleLineMarker

  const fullMergedText = joinLinesRemovingSoftHyphens(rawSegments)

  let lastLines: string[] = []
  let lastLineHeight = Math.round(curSize * 1.15)

  while (curSize >= 8) {
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${curSize}px '${fontFamily}', sans-serif`
    const lineHeight = Math.round(curSize * 1.15)

    const rx = (boxW / 2) * widthRatio
    const ry = (boxH / 2) * widthRatio

    const getAllowedW = (lineIdx: number, totalLines: number) => {
      if (!isEllipse) {
        if (totalLines >= 3 && (lineIdx === 0 || lineIdx === totalLines - 1)) {
          return targetMaxW * 0.92
        }
        return targetMaxW
      }
      const yPos = (lineIdx - (totalLines - 1) / 2) * lineHeight
      return Math.min(targetMaxW, getEllipseWidthAtY(yPos, rx, ry))
    }

    let lines: string[] = []
    let hadHyphenation = false
    let hadForcedCharSplit = false

    if (!isManualLayout) {
      // 1. Полный автоперенос с нуля
      const opt = layoutSegmentOptimal(ctx, fullMergedText, targetMaxW, minHyphens, getAllowedW)
      lines = opt.lines
      hadHyphenation = opt.hadHyphenation
      hadForcedCharSplit = opt.hadForcedCharSplit
    } else {
      // 2. Ручные переносы строк пользователя.
      // КАТЕГОРИЧЕСКИ нельзя откатываться к fullMergedText и стирать ручные \n.
      const totalUserLines = rawSegments.length
      const widthLimitFor = (lineIdx: number) =>
        (isEllipse ? getAllowedW(lineIdx, totalUserLines) : targetMaxW) * 1.03

      const userLinesFitWidth = rawSegments.every(
        (seg, idx) => ctx.measureText(seg).width <= widthLimitFor(idx)
      )
      const userLinesFitHeight = totalUserLines * lineHeight <= boxH * 0.95

      if (userLinesFitWidth && userLinesFitHeight) {
        lines = rawSegments
      } else if (curSize === 8) {
        // Минимальный кегль: разбиваем ТОЛЬКО те строки, которые физически
        // не помещаются в рамку, остальные строки пользователя не трогаем.
        lines = []
        for (let sIdx = 0; sIdx < rawSegments.length; sIdx++) {
          const seg = rawSegments[sIdx]
          const limit = widthLimitFor(sIdx)

          if (ctx.measureText(seg).width <= limit) {
            lines.push(seg)
          } else {
            const segOpt = layoutSegmentOptimal(ctx, seg, targetMaxW, minHyphens, () => limit)
            lines.push(...segOpt.lines)
            hadHyphenation = hadHyphenation || segOpt.hadHyphenation
            hadForcedCharSplit = hadForcedCharSplit || segOpt.hadForcedCharSplit
          }
        }
      } else {
        // Строки пользователя не помещаются — сохраняем их и уменьшаем кегль.
        lastLines = rawSegments
        lastLineHeight = lineHeight
        const step = curSize > 24 ? 2 : 1
        curSize = Math.max(8, curSize - step)
        continue
      }
    }

    lastLines = lines
    lastLineHeight = lineHeight

    const totalL = lines.length
    const allLinesFitWidth = lines.every((line, idx) => {
      const lineLimit = (isEllipse ? getAllowedW(idx, totalL) : targetMaxW) * 1.03
      return ctx.measureText(line).width <= lineLimit
    })
    const fitsHeight = totalL * lineHeight <= boxH * 0.95

    if (allLinesFitWidth && fitsHeight) {
      if (hadForcedCharSplit && curSize > 9) {
        curSize -= 1
        continue
      }
      if (minHyphens && hadHyphenation && curSize > 12) {
        curSize -= 1
        continue
      }
      return { lines, actualFontSize: curSize, lineHeight }
    }

    if (curSize <= 8) break

    const step = curSize > 24 ? 2 : 1
    curSize = Math.max(8, curSize - step)
  }

  return {
    lines: lastLines.length > 0 ? lastLines : rawSegments,
    actualFontSize: 8,
    lineHeight: lastLineHeight,
  }
}

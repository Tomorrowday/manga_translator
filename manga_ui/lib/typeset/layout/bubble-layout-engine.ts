// manga_ui/lib/typeset/layout/bubble-layout-engine.ts
// Главный движок верстки текста бабла: подбор кегля, учет формы (прямоугольник/овал) и ручных переносов

import { getEllipseWidthAtY } from "./ellipse-geometry"
import { joinLinesRemovingSoftHyphens } from "./compound-words"
import { layoutSegmentOptimal } from "./segment-breaker"

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

  const rawSegments = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)

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

    if (rawSegments.length <= 1) {
      // 1. Полный автоперенос с нуля
      const opt = layoutSegmentOptimal(ctx, fullMergedText, targetMaxW, minHyphens, getAllowedW)
      lines = opt.lines
      hadHyphenation = opt.hadHyphenation
      hadForcedCharSplit = opt.hadForcedCharSplit
    } else {
      // 2. Ручные переносы строк пользователя
      const totalUserLines = rawSegments.length

      // Проверяем, помещаются ли заданные пользователем строки в текущий овал/прямоугольник
      const userLinesFitWidth = rawSegments.every((seg, idx) => {
        const lineLimit = (isEllipse ? getAllowedW(idx, totalUserLines) : targetMaxW) * 1.05
        return ctx.measureText(seg).width <= lineLimit
      })

      if (userLinesFitWidth) {
        // Все строки пользователя (включая "тебе из") помещаются! Сохраняем их строго в неизменном виде!
        lines = rawSegments
        hadHyphenation = false
        hadForcedCharSplit = false
      } else {
        // Если при текущем размере шрифта какая-то строка не влезла в границу овала,
        // сохраняем все строки, кроме последней, и авто-доверстываем только незавершённый хвост
        const lockedTop = rawSegments.slice(0, -1)
        const flowingTail = rawSegments[rawSegments.length - 1]

        const topFitsWidth = lockedTop.every(
          (seg, idx) => ctx.measureText(seg).width <= (isEllipse ? getAllowedW(idx, totalUserLines) : targetMaxW) * 1.05
        )

        if (topFitsWidth) {
          const tailOpt = layoutSegmentOptimal(
            ctx,
            flowingTail,
            targetMaxW,
            minHyphens,
            (lineIdx, tailTotal) => getAllowedW(lockedTop.length + lineIdx, lockedTop.length + tailTotal)
          )
          lines = [...lockedTop, ...tailOpt.lines]
          hadHyphenation = tailOpt.hadHyphenation
          hadForcedCharSplit = tailOpt.hadForcedCharSplit
        } else {
          // Если верхние строки физически шире баббла на данном кегле, даём циклу уменьшить шрифт
          const fullOpt = layoutSegmentOptimal(ctx, fullMergedText, targetMaxW, minHyphens, getAllowedW)
          lines = fullOpt.lines
          hadHyphenation = fullOpt.hadHyphenation
          hadForcedCharSplit = fullOpt.hadForcedCharSplit
        }
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

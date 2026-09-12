// lib/typeset/layout.ts
// Автоматический перенос строк и подбор размера шрифта под геометрию бабла

import { cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe } from "./hyphenation"

export function getEllipseWidthAtY(yOffset: number, rx: number, ry: number): number {
  if (ry <= 0 || Math.abs(yOffset) >= ry) {
    return rx * 0.58
  }
  const val = Math.max(0, 1 - (yOffset / ry) ** 2)
  return Math.max(rx * 0.58, 2 * rx * Math.sqrt(val))
}

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
  isItalic?: boolean
): { lines: string[]; actualFontSize: number; lineHeight: number } {
  let curSize = fontSize
  const isEllipse = shape === "ellipse"
  const widthRatio = padMode === "fit" ? 0.98 : 0.92

  for (let attempt = 0; attempt < 30; attempt++) {
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${curSize}px '${fontFamily}', sans-serif`
    const lineHeight = Math.round(curSize * 1.15)
    const initialWords = text.trim().split(/\s+/)
    const lines: string[] = []

    if (isEllipse) {
      const rx = (boxW / 2) * widthRatio
      const ry = (boxH / 2) * widthRatio
      const totalTextW = ctx.measureText(text).width
      const estLines = Math.max(1, Math.min(25, Math.ceil(totalTextW / (boxW * 0.78))))
      const remainingWords = [...initialWords]

      while (remainingWords.length > 0 && lines.length < 35) {
        const curIdx = lines.length
        const yPos = (curIdx - (estLines - 1) / 2) * lineHeight
        const allowedW = getEllipseWidthAtY(yPos, rx, ry)

        let curLine = ""

        while (remainingWords.length > 0) {
          const w = cleanLeadingPunct(remainingWords[0])
          const testLine = curLine ? `${curLine} ${w}` : w

          if (ctx.measureText(testLine).width <= allowedW) {
            curLine = testLine
            remainingWords.shift()
            continue
          }

          let hyphenated = false
          const splits = getWordHyphenSplits(w)

          for (const split of splits) {
            const hyphenTest = curLine ? `${curLine} ${split.prefix}` : split.prefix
            if (ctx.measureText(hyphenTest).width <= allowedW) {
              curLine = hyphenTest
              remainingWords[0] = cleanLeadingPunct(split.suffix)
              hyphenated = true
              break
            }
          }

          if (hyphenated) break

          if (curLine) {
            break
          } else {
            let splitIdx = -1
            let part = ""
            for (let cIdx = 0; cIdx < w.length; cIdx++) {
              const char = w[cIdx]
              const test = appendHyphenSafe(part + char)
              if (ctx.measureText(test).width > allowedW && part.length >= 2) {
                splitIdx = cIdx
                break
              }
              part += char
            }

            if (splitIdx !== -1) {
              lines.push(appendHyphenSafe(part))
              curLine = ""
              remainingWords[0] = cleanLeadingPunct(w.slice(splitIdx))
            } else {
              lines.push(w)
              curLine = ""
              remainingWords.shift()
            }
            break
          }
        }

        if (curLine) lines.push(curLine)
      }
    } else {
      const maxW = boxW * widthRatio
      const remainingWords = [...initialWords]
      let curLine = ""

      while (remainingWords.length > 0) {
        const w = cleanLeadingPunct(remainingWords[0])
        const testLine = curLine ? `${curLine} ${w}` : w

        if (ctx.measureText(testLine).width <= maxW) {
          curLine = testLine
          remainingWords.shift()
        } else {
          let hyphenated = false
          const splits = getWordHyphenSplits(w)

          for (const split of splits) {
            const hyphenTest = curLine ? `${curLine} ${split.prefix}` : split.prefix
            if (ctx.measureText(hyphenTest).width <= maxW) {
              lines.push(hyphenTest)
              curLine = ""
              remainingWords[0] = cleanLeadingPunct(split.suffix)
              hyphenated = true
              break
            }
          }

          if (!hyphenated) {
            if (curLine) {
              lines.push(curLine)
              curLine = ""
            } else {
              let splitIdx = -1
              let part = ""
              for (let cIdx = 0; cIdx < w.length; cIdx++) {
                const char = w[cIdx]
                const test = appendHyphenSafe(part + char)
                if (ctx.measureText(test).width > maxW && part.length >= 2) {
                  splitIdx = cIdx
                  break
                }
                part += char
              }

              if (splitIdx !== -1) {
                lines.push(appendHyphenSafe(part))
                curLine = ""
                remainingWords[0] = cleanLeadingPunct(w.slice(splitIdx))
              } else {
                lines.push(w)
                curLine = ""
                remainingWords.shift()
              }
            }
          }
        }
      }
      if (curLine) lines.push(curLine)
    }

    for (let i = lines.length - 1; i > 0; i--) {
      if (/^[-—–.,!?:;…«»"'\s]+$/.test(lines[i].trim())) {
        lines[i - 1] = lines[i - 1].trimEnd() + lines[i].trim()
        lines.splice(i, 1)
      }
    }

    const targetW = isEllipse ? boxW * 0.9 : boxW * widthRatio
    const allLinesFitWidth = lines.every((line) => ctx.measureText(line).width <= targetW * 1.02)
    const totalHeight = lines.length * lineHeight
    const fitsHeight = totalHeight <= boxH * 0.95

    if ((allLinesFitWidth && fitsHeight) || curSize <= 8) {
      return { lines, actualFontSize: curSize, lineHeight }
    }

    curSize = Math.max(8, curSize - 1)
  }

  const finalLineHeight = Math.round(curSize * 1.15)
  return { lines: text.split(/\s+/), actualFontSize: curSize, lineHeight: finalLineHeight }
}
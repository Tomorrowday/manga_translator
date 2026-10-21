// manga_ui/lib/typeset/layout.ts
// Автоматический перенос строк, поддержка ручных переносов (\n),
// подбор размера шрифта под геометрию бабла и строгое оптическое центрирование

import { cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe } from "./hyphenation"

export function getEllipseWidthAtY(yOffset: number, rx: number, ry: number): number {
  if (ry <= 0 || Math.abs(yOffset) >= ry) {
    return rx * 0.58
  }
  const val = Math.max(0, 1 - (yOffset / ry) ** 2)
  return Math.max(rx * 0.58, 2 * rx * Math.sqrt(val))
}

function cleanAndTrimLines(rawLines: string[]): string[] {
  const result: string[] = []

  for (let i = 0; i < rawLines.length; i++) {
    result.push(rawLines[i].trim())
  }

  // Удаляем висячую пунктуацию на отдельных строках (точки, запятые, многоточия, тире)
  for (let i = result.length - 1; i > 0; i--) {
    const cur = result[i]
    if (/^[.,!?:;…«»"'\s]+$/.test(cur)) {
      result[i - 1] = (result[i - 1] + cur).trim()
      result.splice(i, 1)
    } else if (/^[-—–−]+$/.test(cur)) {
      result[i - 1] = (result[i - 1] + " " + cur).trim()
      result.splice(i, 1)
    }
  }

  return result
}

function _layoutParagraphs(
  ctx: CanvasRenderingContext2D,
  paragraphs: string[],
  minHyphens: boolean,
  getAllowedWidth: (lineIdx: number) => number
): { lines: string[]; hadHyphenation: boolean } {
  const lines: string[] = []
  let hadHyphenation = false

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx].trim()
    if (!paragraph) {
      if (lines.length < 35) lines.push("")
      continue
    }

    const remainingWords = paragraph.split(/\s+/)
    let curLine = ""

    while (remainingWords.length > 0 && lines.length < 35) {
      const allowedW = getAllowedWidth(lines.length)
      const w = remainingWords[0]
      if (!w) {
        remainingWords.shift()
        continue
      }

      const testLine = curLine ? `${curLine} ${w}`.trim() : w.trim()

      if (ctx.measureText(testLine).width <= allowedW) {
        curLine = testLine
        remainingWords.shift()
        continue
      }

      // Не поместилось: если включен режим минимальных переносов и строка уже не пуста — переносим слово целиком
      if (minHyphens && curLine.length > 0) {
        lines.push(curLine.trim())
        curLine = ""
        continue
      }

      // Пробуем слоговой дефисный перенос слова
      let hyphenated = false
      const splits = getWordHyphenSplits(w)

      for (const split of splits) {
        const hyphenTest = curLine ? `${curLine} ${split.prefix}`.trim() : split.prefix.trim()
        if (ctx.measureText(hyphenTest).width <= allowedW) {
          lines.push(hyphenTest.trim())
          curLine = ""
          remainingWords[0] = cleanLeadingPunct(split.suffix)
          hyphenated = true
          hadHyphenation = true
          break
        }
      }

      if (hyphenated) continue

      if (curLine) {
        lines.push(curLine.trim())
        curLine = ""
      } else {
        // Слово не влезает даже в пустую строку: принудительный посимвольный разрыв
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

        hadHyphenation = true
        if (splitIdx !== -1) {
          lines.push(appendHyphenSafe(part).trim())
          curLine = ""
          remainingWords[0] = cleanLeadingPunct(w.slice(splitIdx))
        } else {
          lines.push(w.trim())
          curLine = ""
          remainingWords.shift()
        }
      }
    }

    if (curLine) {
      lines.push(curLine.trim())
    }
  }

  return { lines: cleanAndTrimLines(lines), hadHyphenation }
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
  isItalic?: boolean,
  minHyphens: boolean = true
): { lines: string[]; actualFontSize: number; lineHeight: number } {
  let curSize = Math.max(8, fontSize)
  const isEllipse = shape === "ellipse"
  const widthRatio = padMode === "fit" ? 0.98 : 0.92
  const targetMaxW = isEllipse ? boxW * 0.9 : boxW * widthRatio
  const paragraphs = text.split(/\r?\n/)

  let lastLines: string[] = []
  let lastLineHeight = Math.round(curSize * 1.15)

  while (curSize >= 8) {
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${curSize}px '${fontFamily}', sans-serif`
    const lineHeight = Math.round(curSize * 1.15)

    let getAllowedW: (idx: number) => number

    if (isEllipse) {
      const rx = (boxW / 2) * widthRatio
      const ry = (boxH / 2) * widthRatio
      const estLines = Math.max(
        1,
        Math.min(
          25,
          paragraphs.reduce((acc, p) => {
            const pTrim = p.trim()
            if (!pTrim) return acc + 1
            return acc + Math.max(1, Math.ceil(ctx.measureText(pTrim).width / (boxW * 0.78)))
          }, 0)
        )
      )

      getAllowedW = (idx: number) => {
        const yPos = (idx - (estLines - 1) / 2) * lineHeight
        return getEllipseWidthAtY(yPos, rx, ry)
      }
    } else {
      getAllowedW = () => targetMaxW
    }

    const { lines, hadHyphenation } = _layoutParagraphs(ctx, paragraphs, minHyphens, getAllowedW)
    lastLines = lines
    lastLineHeight = lineHeight

    const allLinesFitWidth = lines.every((line) => ctx.measureText(line).width <= targetMaxW * 1.02)
    const fitsHeight = lines.length * lineHeight <= boxH * 0.96

    if (allLinesFitWidth && fitsHeight) {
      // Если включен режим без дефисов, но переносы всё равно возникли — пробуем уменьшить еще на 1px
      if (minHyphens && hadHyphenation && curSize > 10) {
        curSize -= 1
        continue
      }
      return { lines, actualFontSize: curSize, lineHeight }
    }

    if (curSize <= 8) break

    // Адаптивный шаг уменьшения шрифта: при крупном кегле шагаем быстрее
    const step = curSize > 24 ? 2 : 1
    curSize = Math.max(8, curSize - step)
  }

  // При достижении минимального размера (8px) возвращаем строки, разбитые под рамку, а не сырой неразбитый текст
  return {
    lines: lastLines.length > 0 ? lastLines : paragraphs.map((p) => p.trim()),
    actualFontSize: 8,
    lineHeight: lastLineHeight,
  }
}
// lib/typeset/layout.ts
// Автоматический перенос строк, поддержка ручных переносов (\n),
// подбор размера шрифта под геометрию бабла и строгое оптическое центрирование (устранение влияния пробелов)

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
    const trimmed = rawLines[i].trim()
    result.push(trimmed)
  }

  // Удаляем висячую пунктуацию на отдельных строках (точки, запятые, многоточия)
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
  let curSize = fontSize
  const isEllipse = shape === "ellipse"
  const widthRatio = padMode === "fit" ? 0.98 : 0.92

  // Делим входной текст по ручным переносам Enter (\n)
  const paragraphs = text.split(/\r?\n/)

  for (let attempt = 0; attempt < 30; attempt++) {
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${curSize}px '${fontFamily}', sans-serif`
    const lineHeight = Math.round(curSize * 1.15)
    const lines: string[] = []
    let hadHyphenation = false

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
            const pWidth = ctx.measureText(pTrim).width
            return acc + Math.max(1, Math.ceil(pWidth / (boxW * 0.78)))
          }, 0)
        )
      )

      for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const paragraph = paragraphs[pIdx].trim()
        if (!paragraph) {
          if (lines.length < 35) lines.push("")
          continue
        }

        const remainingWords = paragraph.split(/\s+/)

        while (remainingWords.length > 0 && lines.length < 35) {
          const curIdx = lines.length
          const yPos = (curIdx - (estLines - 1) / 2) * lineHeight
          const allowedW = getEllipseWidthAtY(yPos, rx, ry)

          let curLine = ""

          while (remainingWords.length > 0) {
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

            // Не влезло: если включен режим minHyphens и строка не пуста — переносим всё слово
            if (minHyphens && curLine.length > 0) {
              break
            }

            // Иначе пробуем дефисный перенос
            let hyphenated = false
            const splits = getWordHyphenSplits(w)

            for (const split of splits) {
              const hyphenTest = curLine ? `${curLine} ${split.prefix}`.trim() : split.prefix.trim()
              if (ctx.measureText(hyphenTest).width <= allowedW) {
                curLine = hyphenTest
                remainingWords[0] = cleanLeadingPunct(split.suffix)
                hyphenated = true
                hadHyphenation = true
                break
              }
            }

            if (hyphenated) break

            if (curLine) {
              break
            } else {
              // Слово не влезает даже в пустую строку: принудительный слог
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
              break
            }
          }

          if (curLine) lines.push(curLine.trim())
        }
      }
    } else {
      // ПРЯМОУГОЛЬНЫЙ БАБЛ
      const maxW = boxW * widthRatio

      for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const paragraph = paragraphs[pIdx].trim()
        if (!paragraph) {
          if (lines.length < 35) lines.push("")
          continue
        }

        const remainingWords = paragraph.split(/\s+/)
        let curLine = ""

        while (remainingWords.length > 0) {
          const w = remainingWords[0]
          if (!w) {
            remainingWords.shift()
            continue
          }
          const testLine = curLine ? `${curLine} ${w}`.trim() : w.trim()

          if (ctx.measureText(testLine).width <= maxW) {
            curLine = testLine
            remainingWords.shift()
          } else {
            if (minHyphens && curLine.length > 0) {
              lines.push(curLine.trim())
              curLine = ""
              continue
            }

            let hyphenated = false
            const splits = getWordHyphenSplits(w)

            for (const split of splits) {
              const hyphenTest = curLine ? `${curLine} ${split.prefix}`.trim() : split.prefix.trim()
              if (ctx.measureText(hyphenTest).width <= maxW) {
                lines.push(hyphenTest.trim())
                curLine = ""
                remainingWords[0] = cleanLeadingPunct(split.suffix)
                hyphenated = true
                hadHyphenation = true
                break
              }
            }

            if (!hyphenated) {
              if (curLine) {
                lines.push(curLine.trim())
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
          }
        }
        if (curLine) lines.push(curLine.trim())
      }
    }

    // Полный тримминг всех строк перед замером и рендерингом (устранение сдвига от пробела)
    const cleanedLines = cleanAndTrimLines(lines)

    const targetW = isEllipse ? boxW * 0.9 : boxW * widthRatio
    const allLinesFitWidth = cleanedLines.every((line) => ctx.measureText(line.trim()).width <= targetW * 1.02)
    const totalHeight = cleanedLines.length * lineHeight
    const fitsHeight = totalHeight <= boxH * 0.96

    if (allLinesFitWidth && fitsHeight) {
      if (minHyphens && hadHyphenation && curSize > 10) {
        curSize = curSize - 1
        continue
      }
      return { lines: cleanedLines, actualFontSize: curSize, lineHeight }
    }

    if (curSize <= 8) {
      return { lines: cleanedLines, actualFontSize: curSize, lineHeight }
    }

    curSize = Math.max(8, curSize - 1)
  }

  const finalLineHeight = Math.round(curSize * 1.15)
  const fallbackLines = paragraphs.map((p) => p.trim())
  return { lines: fallbackLines, actualFontSize: curSize, lineHeight: finalLineHeight }
}
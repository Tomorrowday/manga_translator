// manga_ui/lib/typeset/layout_impl.ts
// Автоматический перенос строк с честной поддержкой ручных переносов (\n),
// подбор размера шрифта под геометрию бабла и строгое оптическое центрирование

import { cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe } from "./hyphenation"

// Короткие предлоги, союзы и частицы, которые нежелательно оставлять висящими на конце строки
const NON_BREAKING_SHORT_WORDS = new Set([
  "а", "в", "и", "к", "о", "с", "у", "я",
  "не", "ни", "на", "но", "по", "за", "из", "от", "до", "во", "со", "ко", "об", "ну", "ах", "ох", "эх", "уж", "ух",
])

// Частицы и тире, которые не должны отрываться от предыдущего слова на новую строку
const ATTACH_TO_PREV_WORDS = new Set(["—", "–", "-", "же", "бы", "б", "ли", "ль", "то"])

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
    if (!cur) continue
    if (/^[.,!?:;…«»"'\)\]\s]+$/.test(cur)) {
      result[i - 1] = (result[i - 1] + cur).trim()
      result.splice(i, 1)
    } else if (/^[-—–−]+$/.test(cur)) {
      result[i - 1] = (result[i - 1] + " " + cur).trim()
      result.splice(i, 1)
    }
  }

  return result
}

/**
 * Токенизирует абзац на слова, склеивая тире и частицы ("же", "бы", "ли") с предыдущим словом,
 * чтобы они не оказывались в начале новой строки.
 */
function tokenizeParagraphWords(paragraph: string): string[] {
  const rawTokens = paragraph.trim().split(/\s+/).filter(Boolean)
  if (rawTokens.length <= 1) return rawTokens

  const tokens: string[] = []
  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i]
    const cleanLower = token.replace(/[.,!?:;…«»"'\)\]]+$/g, "").toLowerCase()

    if (tokens.length > 0 && ATTACH_TO_PREV_WORDS.has(cleanLower)) {
      tokens[tokens.length - 1] = `${tokens[tokens.length - 1]} ${token}`
    } else {
      tokens.push(token)
    }
  }

  return tokens
}

/**
 * Проверяет, заканчивается ли текущая строка коротким висячим предлогом/союзом,
 * который лучше перенести вместе со следующим словом.
 */
function endsWithHangingShortWord(line: string): { hasHanging: boolean; withoutLast: string; lastWord: string } {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 2) {
    return { hasHanging: false, withoutLast: line, lastWord: "" }
  }
  const last = parts[parts.length - 1]
  const cleanLast = last.replace(/^[«"(\[…]+/, "").toLowerCase()
  if (NON_BREAKING_SHORT_WORDS.has(cleanLast)) {
    return {
      hasHanging: true,
      withoutLast: parts.slice(0, -1).join(" "),
      lastWord: last,
    }
  }
  return { hasHanging: false, withoutLast: line, lastWord: "" }
}

function _layoutParagraphs(
  ctx: CanvasRenderingContext2D,
  paragraphs: string[],
  minHyphens: boolean,
  getAllowedWidth: (lineIdx: number) => number
): { lines: string[]; hadHyphenation: boolean; hadForcedCharSplit: boolean } {
  const lines: string[] = []
  let hadHyphenation = false
  let hadForcedCharSplit = false

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx].trim()
    if (!paragraph) {
      if (lines.length < 35) lines.push("")
      continue
    }

    const remainingWords = tokenizeParagraphWords(paragraph)
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

      // Если в конце curLine остался короткий предлог ("в", "на", "не", "и", "к"),
      // переносим его на следующую строку вместе со словом w.
      if (curLine.length > 0) {
        const hanging = endsWithHangingShortWord(curLine)
        if (hanging.hasHanging && hanging.withoutLast.length > 0) {
          lines.push(hanging.withoutLast.trim())
          curLine = ""
          remainingWords.unshift(hanging.lastWord)
          continue
        }
      }

      // Если включен режим минимальных переносов и строка уже не пуста — переносим слово целиком
      if (minHyphens && curLine.length > 0) {
        lines.push(curLine.trim())
        curLine = ""
        continue
      }

      // Пробуем слоговой дефисный перенос слова по правилам русской орфографии
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
        hadForcedCharSplit = true
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

  return { lines: cleanAndTrimLines(lines), hadHyphenation, hadForcedCharSplit }
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

  // Ручные переносы строк (\n) пользователя сохраняются на 100% честно:
  // каждая строка — это отдельный смысловой абзац.
  const paragraphs = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p, idx, arr) => (idx === arr.length - 1 && p === "" ? false : true))

  let lastLines: string[] = []
  let lastLineHeight = Math.round(curSize * 1.15)

  while (curSize >= 8) {
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${curSize}px '${fontFamily}', sans-serif`
    const lineHeight = Math.round(curSize * 1.15)

    let lines: string[] = []
    let hadHyphenation = false
    let hadForcedCharSplit = false
    let getAllowedW: (idx: number) => number

    if (isEllipse) {
      const rx = (boxW / 2) * widthRatio
      const ry = (boxH / 2) * widthRatio

      let estLines = Math.max(
        paragraphs.length,
        Math.min(
          28,
          paragraphs.reduce((acc, p) => {
            const pTrim = p.trim()
            if (!pTrim) return acc + 1
            return acc + Math.max(1, Math.ceil(ctx.measureText(pTrim).width / Math.max(20, boxW * 0.76)))
          }, 0)
        )
      )

      getAllowedW = (idx: number) => {
        const yPos = (idx - (estLines - 1) / 2) * lineHeight
        return getEllipseWidthAtY(yPos, rx, ry)
      }

      const pass1 = _layoutParagraphs(ctx, paragraphs, minHyphens, getAllowedW)

      if (pass1.lines.length > 0 && pass1.lines.length !== estLines) {
        estLines = pass1.lines.length
        const pass2 = _layoutParagraphs(ctx, paragraphs, minHyphens, getAllowedW)
        lines = pass2.lines
        hadHyphenation = pass2.hadHyphenation
        hadForcedCharSplit = pass2.hadForcedCharSplit
      } else {
        lines = pass1.lines
        hadHyphenation = pass1.hadHyphenation
        hadForcedCharSplit = pass1.hadForcedCharSplit
      }
    } else {
      getAllowedW = () => targetMaxW
      const res = _layoutParagraphs(ctx, paragraphs, minHyphens, getAllowedW)
      lines = res.lines
      hadHyphenation = res.hadHyphenation
      hadForcedCharSplit = res.hadForcedCharSplit
    }

    lastLines = lines
    lastLineHeight = lineHeight

    const allLinesFitWidth = lines.every((line, idx) => {
      const lineLimit = isEllipse ? Math.min(targetMaxW, getAllowedW(idx) * 1.04) : targetMaxW * 1.02
      return ctx.measureText(line).width <= lineLimit
    })
    const fitsHeight = lines.length * lineHeight <= boxH * 0.96

    if (allLinesFitWidth && fitsHeight) {
      if (hadForcedCharSplit && curSize > 9) {
        curSize -= 1
        continue
      }
      if (minHyphens && hadHyphenation && curSize > 10) {
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
    lines: lastLines.length > 0 ? lastLines : paragraphs.map((p) => p.trim()),
    actualFontSize: 8,
    lineHeight: lastLineHeight,
  }
}
// manga_ui/lib/typeset/layout_impl.ts
// Оптимальная верстка текста манги («ромб / овал») с честным сохранением пользовательских переносов
// и автоматическим пересчётом хвоста при любых изменениях текста или геометрии баббла

import { cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe } from "./hyphenation"

// Короткие предлоги, союзы и частицы, которые не должны висеть на конце строки
const NON_BREAKING_PREPOSITIONS = new Set([
  "а", "в", "и", "к", "о", "с", "у", "я",
  "не", "ни", "на", "но", "по", "за", "из", "от", "до", "во", "со", "ко", "об",
  "ну", "ах", "ох", "эх", "уж", "ух",
])

// Частицы и тире, которые приклеиваются к предыдущему слову
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
    const trimmed = rawLines[i].trim()
    if (trimmed || rawLines.length === 1) {
      result.push(trimmed)
    }
  }

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
 * Склеивает строки обратно в чистый поток слов, убирая мягкие дефисы слогового переноса,
 * но сохраняя дефисы в сложных словах ("по-русски", "кто-то", "из-за") и японских суффиксах ("Отаку-куна").
 */
export function joinLinesRemovingSoftHyphens(lines: string[]): string {
  let acc = ""
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (!acc) {
      acc = line
      continue
    }

    if (acc.endsWith("-") && !acc.endsWith(" -") && !acc.endsWith("—") && !acc.endsWith("–")) {
      const prevWords = acc.slice(0, -1).split(/\s+/)
      const rawLastPrevWord = prevWords[prevWords.length - 1] || ""
      const lastPrevWord = rawLastPrevWord.replace(/^[«"(\[…]+/, "").toLowerCase()
      const nextWords = line.split(/\s+/)
      const rawFirstNextWord = nextWords[0] || ""
      const firstNextWord = rawFirstNextWord.replace(/[.,!?:;…«»"'\)\]]+$/g, "").toLowerCase()

      // Японские именные суффиксы и обращения (с учётом склонений: -кун/-куна, -тян/-тянке, -сан/-сана, -сама/-самы и т.д.)
      const isJapaneseSuffix =
        /^(кун|тян|чан|сан|сама|доно|с[еэ]нс[еэ]й|с[еэ]мпай|семпай|кохай|си|д[еэ]нка|х[еэ]нка|онни|оннии|онии)[а-яё]*$/i.test(firstNextWord)

      // Частицы, присоединяемые через дефис
      const isCompoundParticle =
        ["то", "либо", "нибудь", "таки", "ка", "де", "мол"].includes(firstNextWord)

      // Вопросительные/неопределенные местоимения с частицами ("кто-то", "что-нибудь", "где-то")
      const isCompoundQuestionWord =
        ["кто", "что", "как", "где", "куда", "откуда", "когда", "почему", "зачем", "какой", "чей"].includes(lastPrevWord) &&
        isCompoundParticle

      // Приставки "кое-" / "кой-"
      const isCompoundPrefix =
        lastPrevWord === "кое" || lastPrevWord === "кой"

      // Составные предлоги ("из-за", "из-под", "по-над")
      const isCompoundPreposition =
        (lastPrevWord === "из" && (firstNextWord === "за" || firstNextWord === "под")) ||
        (lastPrevWord === "по" && (firstNextWord === "над" || firstNextWord === "за"))

      // Наречия с приставкой "по-" ("по-русски", "по-моему", "по-прежнему", "по-другому")
      const isPoAdverb =
        lastPrevWord === "по" &&
        (firstNextWord.endsWith("ски") ||
          firstNextWord.endsWith("цки") ||
          firstNextWord.endsWith("ьи") ||
          firstNextWord.endsWith("ому") ||
          firstNextWord.endsWith("ему") ||
          [
            "русски", "немецки", "братски", "волчьи", "птичьи", "всякому",
            "другому", "прежнему", "новому", "любому", "моему", "твоему",
            "нашему", "вашему", "пустому", "глупому", "честному",
          ].includes(firstNextWord))

      const isRealCompoundWord =
        isJapaneseSuffix ||
        isCompoundParticle ||
        isCompoundQuestionWord ||
        isCompoundPrefix ||
        isCompoundPreposition ||
        isPoAdverb

      if (isRealCompoundWord) {
        acc = `${acc}${line}`
      } else {
        acc = `${acc.slice(0, -1)}${line}`
      }
    } else {
      acc = `${acc} ${line}`
    }
  }
  return acc
}

function tokenizeMangaPhrase(text: string): string[] {
  const rawTokens = text.trim().split(/\s+/).filter(Boolean)
  if (rawTokens.length <= 1) return rawTokens

  // Шаг 1: Приклеиваем частицы и тире к предыдущему слову
  const step1: string[] = []
  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i]
    const cleanLower = token.replace(/[.,!?:;…«»"'\)\]]+$/g, "").toLowerCase()

    if (step1.length > 0 && ATTACH_TO_PREV_WORDS.has(cleanLower)) {
      step1[step1.length - 1] = `${step1[step1.length - 1]} ${token}`
    } else {
      step1.push(token)
    }
  }

  // Шаг 2: Приклеиваем короткие предлоги/союзы (без знаков препинания на конце) к следующему слову
  const step2: string[] = []
  let i = 0
  while (i < step1.length) {
    const token = step1[i]
    const strippedLead = token.replace(/^[«"(\[…]+/, "")
    const hasTrailingPunct = /[.,!?:;…«»"'\)\]]$/.test(strippedLead)
    const cleanLower = strippedLead.toLowerCase()

    if (
      !hasTrailingPunct &&
      NON_BREAKING_PREPOSITIONS.has(cleanLower) &&
      i + 1 < step1.length
    ) {
      step2.push(`${token} ${step1[i + 1]}`)
      i += 2
    } else {
      step2.push(token)
      i += 1
    }
  }

  return step2
}

function expandOversizedTokens(
  ctx: CanvasRenderingContext2D,
  tokens: string[],
  maxLineWidth: number,
  minHyphens: boolean
): { units: string[]; hadHyphenation: boolean; hadForcedCharSplit: boolean } {
  const units: string[] = []
  let hadHyphenation = false
  let hadForcedCharSplit = false

  const queue = [...tokens]

  while (queue.length > 0) {
    const token = queue.shift()!
    if (ctx.measureText(token).width <= maxLineWidth) {
      units.push(token)
      continue
    }

    if (token.includes(" ")) {
      const subParts = token.split(/\s+/)
      queue.unshift(...subParts)
      continue
    }

    const splits = getWordHyphenSplits(token)
    let splitDone = false

    if (!minHyphens || ctx.measureText(token).width > maxLineWidth) {
      for (const sp of splits) {
        if (ctx.measureText(sp.prefix).width <= maxLineWidth) {
          units.push(sp.prefix)
          queue.unshift(cleanLeadingPunct(sp.suffix))
          hadHyphenation = true
          splitDone = true
          break
        }
      }
    }

    if (splitDone) continue

    let splitIdx = -1
    let part = ""
    for (let cIdx = 0; cIdx < token.length; cIdx++) {
      const char = token[cIdx]
      const test = appendHyphenSafe(part + char)
      if (ctx.measureText(test).width > maxLineWidth && part.length >= 2) {
        splitIdx = cIdx
        break
      }
      part += char
    }

    hadHyphenation = true
    hadForcedCharSplit = true

    if (splitIdx !== -1) {
      units.push(appendHyphenSafe(part).trim())
      queue.unshift(cleanLeadingPunct(token.slice(splitIdx)))
    } else {
      units.push(token)
    }
  }

  return { units, hadHyphenation, hadForcedCharSplit }
}

/**
 * Оценка качества компоновки по стандарту манги (меньше = лучше):
 * одинаково строит аккуратный ромб/бочонок как в режиме Oval, так и в режиме Rect!
 */
function scoreMangaLinesConfiguration(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  getAllowedW: (lineIdx: number, totalLines: number) => number,
  targetMaxW: number
): number {
  const n = lines.length
  if (n === 0) return 0

  const widths = lines.map((l) => ctx.measureText(l).width)

  for (let i = 0; i < n; i++) {
    const limit = getAllowedW(i, n)
    if (widths[i] > limit * 1.01) {
      return 1e9 + (widths[i] - limit) * 10000
    }
  }

  if (n === 1) return 0

  let penalty = 0
  const maxW = Math.max(...widths, 1)
  const avgW = widths.reduce((a, b) => a + b, 0) / n

  const mid = (n - 1) / 2
  for (let i = 0; i < n; i++) {
    const w = widths[i]
    const distFromCenter = mid > 0 ? Math.abs(i - mid) / mid : 0
    // Профиль манги: центральные строки самые широкие (1.0), крайние чуть уже или равны (0.80..0.95)
    const idealRatio = 1 - distFromCenter * 0.18
    const actualRatio = w / maxW
    const diff = actualRatio - idealRatio
    penalty += diff * diff * 130

    if (w < avgW * 0.55) {
      penalty += ((avgW * 0.55 - w) / targetMaxW) * 280
    }

    const words = lines[i].split(/\s+/)
    const lastWord = words[words.length - 1]?.replace(/^[«"(\[…]+/, "").toLowerCase()
    if (words.length > 1 && NON_BREAKING_PREPOSITIONS.has(lastWord)) {
      penalty += 450
    }
  }

  // Жёсткий штраф за "талию песочных часов" (короткая строка зажата между двумя широкими)
  for (let i = 1; i < n - 1; i++) {
    if (widths[i] < widths[i - 1] * 0.82 && widths[i] < widths[i + 1] * 0.82) {
      penalty += 950
    }
  }

  // Штраф за неоправданно большое число узких строк ("Раз / ты / сделаешь / предложение / мне / из / настоящего...")
  penalty += n * 35

  return penalty
}

function layoutSegmentOptimal(
  ctx: CanvasRenderingContext2D,
  segmentText: string,
  targetMaxW: number,
  minHyphens: boolean,
  getAllowedW: (lineIdx: number, totalLines: number) => number
): { lines: string[]; hadHyphenation: boolean; hadForcedCharSplit: boolean } {
  const initialTokens = tokenizeMangaPhrase(segmentText)
  if (initialTokens.length === 0) {
    return { lines: [], hadHyphenation: false, hadForcedCharSplit: false }
  }

  const { units, hadHyphenation, hadForcedCharSplit } = expandOversizedTokens(
    ctx,
    initialTokens,
    targetMaxW,
    minHyphens
  )

  const m = units.length
  if (m === 1) {
    return { lines: [units[0]], hadHyphenation, hadForcedCharSplit }
  }

  const lineStr: string[][] = Array.from({ length: m }, () => Array(m).fill(""))
  const lineW: number[][] = Array.from({ length: m }, () => Array(m).fill(0))

  for (let i = 0; i < m; i++) {
    let cur = ""
    for (let j = i; j < m; j++) {
      cur = j === i ? units[j] : `${cur} ${units[j]}`
      lineStr[i][j] = cur
      lineW[i][j] = ctx.measureText(cur).width
    }
  }

  const totalTextW = lineW[0][m - 1]
  const minLines = Math.max(1, Math.ceil(totalTextW / targetMaxW))
  const maxLines = Math.min(m, Math.max(minLines + 3, Math.ceil(totalTextW / (targetMaxW * 0.52)) + 1))

  let bestLines: string[] | null = null
  let bestScore = Infinity

  for (let k = minLines; k <= maxLines; k++) {
    const dp: number[][] = Array.from({ length: k + 1 }, () => Array(m + 1).fill(Infinity))
    const parent: number[][] = Array.from({ length: k + 1 }, () => Array(m + 1).fill(-1))
    dp[0][0] = 0

    for (let lineIdx = 1; lineIdx <= k; lineIdx++) {
      const allowedForThisLine = getAllowedW(lineIdx - 1, k)

      for (let j = lineIdx; j <= m - (k - lineIdx); j++) {
        for (let i = lineIdx - 1; i < j; i++) {
          if (dp[lineIdx - 1][i] === Infinity) continue

          let hasInternalHyphenBreak = false
          for (let t = i; t < j - 1; t++) {
            if (units[t].endsWith("-") && !units[t].endsWith(" -")) {
              hasInternalHyphenBreak = true
              break
            }
          }
          if (hasInternalHyphenBreak) continue

          const w = lineW[i][j - 1]
          if (w > allowedForThisLine * 1.01 && j - i > 1) continue

          let stepCost = 0
          if (w > allowedForThisLine) {
            stepCost += (w - allowedForThisLine) * 5000
          }

          const mid = (k - 1) / 2
          const distFromCenter = mid > 0 ? Math.abs(lineIdx - 1 - mid) / mid : 0
          const targetFill = allowedForThisLine * (0.88 - distFromCenter * 0.14)
          const fillDiff = (w - targetFill) / targetMaxW
          stepCost += fillDiff * fillDiff * 100

          const cand = dp[lineIdx - 1][i] + stepCost
          if (cand < dp[lineIdx][j]) {
            dp[lineIdx][j] = cand
            parent[lineIdx][j] = i
          }
        }
      }
    }

    if (dp[k][m] < Infinity) {
      const candidateLines: string[] = []
      let curToken = m
      for (let lineIdx = k; lineIdx >= 1; lineIdx--) {
        const prevToken = parent[lineIdx][curToken]
        if (prevToken === -1) break
        candidateLines.unshift(lineStr[prevToken][curToken - 1])
        curToken = prevToken
      }

      if (candidateLines.length === k) {
        const fullScore = scoreMangaLinesConfiguration(ctx, candidateLines, getAllowedW, targetMaxW)
        if (fullScore < bestScore) {
          bestScore = fullScore
          bestLines = candidateLines
        }
      }
    }
  }

  if (!bestLines || bestScore >= 1e9) {
    const greedyLines = greedyFallbackWithHyphens(ctx, initialTokens, minHyphens, (idx) =>
      getAllowedW(idx, Math.max(minLines, 3))
    )
    return {
      lines: cleanAndTrimLines(greedyLines.lines),
      hadHyphenation: hadHyphenation || greedyLines.hadHyphenation,
      hadForcedCharSplit: hadForcedCharSplit || greedyLines.hadForcedCharSplit,
    }
  }

  return {
    lines: cleanAndTrimLines(bestLines),
    hadHyphenation,
    hadForcedCharSplit,
  }
}

function greedyFallbackWithHyphens(
  ctx: CanvasRenderingContext2D,
  tokens: string[],
  minHyphens: boolean,
  getAllowedW: (lineIdx: number) => number
): { lines: string[]; hadHyphenation: boolean; hadForcedCharSplit: boolean } {
  const lines: string[] = []
  let hadHyphenation = false
  let hadForcedCharSplit = false
  const remaining = [...tokens]
  let curLine = ""

  while (remaining.length > 0 && lines.length < 35) {
    const allowedW = getAllowedW(lines.length)
    const w = remaining[0]
    if (!w) {
      remaining.shift()
      continue
    }

    const testLine = curLine ? `${curLine} ${w}`.trim() : w.trim()
    if (ctx.measureText(testLine).width <= allowedW) {
      curLine = testLine
      remaining.shift()
      continue
    }

    if (minHyphens && curLine.length > 0) {
      lines.push(curLine.trim())
      curLine = ""
      continue
    }

    if (w.includes(" ")) {
      const parts = w.split(/\s+/)
      remaining.shift()
      remaining.unshift(...parts)
      continue
    }

    let hyphenated = false
    const splits = getWordHyphenSplits(w)
    for (const split of splits) {
      const hyphenTest = curLine ? `${curLine} ${split.prefix}`.trim() : split.prefix.trim()
      if (ctx.measureText(hyphenTest).width <= allowedW) {
        lines.push(hyphenTest.trim())
        curLine = ""
        remaining[0] = cleanLeadingPunct(split.suffix)
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
        remaining[0] = cleanLeadingPunct(w.slice(splitIdx))
      } else {
        lines.push(w.trim())
        curLine = ""
        remaining.shift()
      }
    }
  }

  if (curLine) {
    lines.push(curLine.trim())
  }

  return { lines, hadHyphenation, hadForcedCharSplit }
}

/**
 * Вычисляет новую строку для сохранения в `box.rusText` после редактирования пользователем:
 * - Сохраняет `\n` ТОЛЬКО в тех строках, которые пользователь намеренно зафиксировал или разорвал.
 * - Всё, что находится после изменённого переноса, склеивается через пробел в единый поток,
 *   чтобы `layoutBubbleTextLines` автоматически скомпоновал остаток баббла!
 * - Если же пользователь вообще не менял переносы (или только исправил опечатку в слове),
 *   не превращает автопереносы в "замороженные" `\n`.
 */
export function reflowFromManualLines(
  previousRenderedLines: string[],
  editedText: string
): string {
  const rawEditedLines = editedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (rawEditedLines.length === 0) return ""

  const prevTrimmed = previousRenderedLines.map((l) => l.trim()).filter(Boolean)

  let lastModifiedLineIdx = -1
  const minLen = Math.min(prevTrimmed.length, rawEditedLines.length)

  for (let i = 0; i < minLen; i++) {
    if (prevTrimmed[i] !== rawEditedLines[i]) {
      lastModifiedLineIdx = i
      break
    }
  }

  if (lastModifiedLineIdx === -1 && rawEditedLines.length !== prevTrimmed.length) {
    lastModifiedLineIdx = minLen - 1
  }

  if (lastModifiedLineIdx === -1) {
    return joinLinesRemovingSoftHyphens(rawEditedLines)
  }

  const lockedTopLines = rawEditedLines.slice(0, lastModifiedLineIdx + 1)
  const autoReflowTail = joinLinesRemovingSoftHyphens(rawEditedLines.slice(lastModifiedLineIdx + 1))

  if (!autoReflowTail) {
    return lockedTopLines.join("\n")
  }

  return [...lockedTopLines, autoReflowTail].join("\n")
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
  const widthRatio = padMode === "fit" ? 0.96 : 0.90
  const targetMaxW = boxW * widthRatio

  const rawSegments = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const fullMergedText = joinLinesRemovingSoftHyphens(rawSegments)

  const avgSegLen =
    rawSegments.length > 0
      ? rawSegments.reduce((sum, s) => sum + s.length, 0) / rawSegments.length
      : 0
  const isLegacyFrozenArtifact = rawSegments.length >= 4 && avgSegLen < 10

  const effectiveSegments = isLegacyFrozenArtifact ? [fullMergedText] : rawSegments

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

    if (effectiveSegments.length <= 1) {
      const opt = layoutSegmentOptimal(ctx, fullMergedText, targetMaxW, minHyphens, getAllowedW)
      lines = opt.lines
      hadHyphenation = opt.hadHyphenation
      hadForcedCharSplit = opt.hadForcedCharSplit
    } else {
      const lockedTop = effectiveSegments.slice(0, -1)
      const flowingTail = effectiveSegments[effectiveSegments.length - 1]

      const topFitsWidth = lockedTop.every(
        (seg, idx) => ctx.measureText(seg).width <= getAllowedW(idx, Math.max(effectiveSegments.length + 1, 3)) * 1.02
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
        const fullOpt = layoutSegmentOptimal(ctx, fullMergedText, targetMaxW, minHyphens, getAllowedW)
        lines = fullOpt.lines
        hadHyphenation = fullOpt.hadHyphenation
        hadForcedCharSplit = fullOpt.hadForcedCharSplit
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
    lines: lastLines.length > 0 ? lastLines : effectiveSegments,
    actualFontSize: 8,
    lineHeight: lastLineHeight,
  }
}
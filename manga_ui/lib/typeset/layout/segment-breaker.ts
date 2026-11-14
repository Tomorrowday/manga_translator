// manga_ui/lib/typeset/layout/segment-breaker.ts
// Разбиение текстового сегмента на строки: динамическое программирование и жадный фоллбэк

import { cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe } from "../hyphenation"
import { cleanAndTrimLines, expandOversizedTokens, tokenizeMangaPhrase } from "./tokenizer"
import { scoreMangaLinesConfiguration } from "./line-scoring"

export function layoutSegmentOptimal(
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

  const { units, isSoftHyphen, hadHyphenation, hadForcedCharSplit } = expandOversizedTokens(
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
      if (j === i) {
        cur = units[j]
      } else {
        // Если предыдущий токен заканчивается на родной дефис ("Ямада-"), склеиваем со второй частью БЕЗ пробела
        const prevEndsWithNativeDash =
          units[j - 1].endsWith("-") && !units[j - 1].endsWith(" -") && !isSoftHyphen[j - 1]
        cur = prevEndsWithNativeDash ? `${cur}${units[j]}` : `${cur} ${units[j]}`
      }
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

          // Запрещаем внутри одной строки только искусственные мягкие слоговые переносы
          let hasInternalSoftHyphen = false
          for (let t = i; t < j - 1; t++) {
            if (isSoftHyphen[t]) {
              hasInternalSoftHyphen = true
              break
            }
          }
          if (hasInternalSoftHyphen) continue

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

export function greedyFallbackWithHyphens(
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

    const testLine = curLine
      ? curLine.endsWith("-") && !curLine.endsWith(" -")
        ? `${curLine}${w}`.trim()
        : `${curLine} ${w}`.trim()
      : w.trim()

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
      const hyphenTest = curLine
        ? curLine.endsWith("-") && !curLine.endsWith(" -")
          ? `${curLine}${split.prefix}`.trim()
          : `${curLine} ${split.prefix}`.trim()
        : split.prefix.trim()

      if (ctx.measureText(hyphenTest).width <= allowedW) {
        lines.push(hyphenTest.trim())
        curLine = ""
        remaining[0] = cleanLeadingPunct(split.suffix)
        hyphenated = true
        if (!split.isNativeHyphen) hadHyphenation = true
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

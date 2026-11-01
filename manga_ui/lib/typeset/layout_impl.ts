// manga_ui/lib/typeset/layout_impl.ts
// Оптимальная верстка текста манги («ромб / овал») с надежным сохранением дефисов в двусоставных словах,
// свободным переносом дефисных соединений, поддержкой ручных переносов строк и автобалансировкой

import { cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe } from "./hyphenation"

// Короткие предлоги, союзы и частицы для мягкого балансирования (без принудительной склейки)
const NON_BREAKING_PREPOSITIONS = new Set([
  "а", "в", "и", "к", "о", "с", "у", "я",
  "не", "ни", "на", "но", "по", "за", "из", "от", "до", "во", "со", "ко", "об",
  "ну", "ах", "ох", "эх", "уж", "ух",
])

// Частицы и тире, приклеивающиеся к предыдущему слову
const ATTACH_TO_PREV_WORDS = new Set(["—", "–", "-", "же", "бы", "б", "ли", "ль"])

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
 * Надежно определяет, является ли пара частей истинным двусоставным словом с дефисом,
 * который категорически нельзя удалять при пересчете верстки.
 */
export function isCompoundHyphenPair(rawLeft: string, rawRight: string): boolean {
  const left = rawLeft.replace(/^[«"(\[…\s]+/, "").toLowerCase()
  const right = rawRight.replace(/[.,!?:;…«»"'\)\]\s]+$/g, "").toLowerCase()
  if (!left || !right) return false

  const cleanRightOriginal = rawRight.replace(/[.,!?:;…«»"'\)\]\s]+$/g, "")

  // 1. Вторая часть с заглавной буквы (имена, двойные фамилии: Римский-Корсаков, Анна-Мария, Санкт-Петербург)
  if (/^[А-ЯЁA-Z]/.test(cleanRightOriginal)) return true

  // 2. Часть с цифрами (2-й, 10-летие, 3D-модель)
  if (/^\d+$/.test(left) || /^\d+$/.test(right)) return true

  // 3. Постфиксы и частицы через дефис (кто-то, кого-то, кому-то, какой-нибудь, как-либо, все-таки, ну-ка, дай-ка)
  if (["то", "либо", "нибудь", "таки", "ка", "де", "мол", "с"].includes(right)) {
    return true
  }

  // 4. Вопросительные/неопределенные местоимения в ЛЮБЫХ падежах перед дефисом
  if (
    [
      "кто", "кого", "кому", "кем", "ком",
      "что", "чего", "чему", "чем",
      "какой", "какого", "какому", "каким", "каком", "какая", "какой", "какую", "какое", "какие", "каких", "какими",
      "чей", "чьего", "чьему", "чьим", "чьем", "чья", "чьей", "чью", "чье", "чьи", "чьих", "чьими",
      "где", "куда", "откуда", "когда", "как", "почему", "зачем", "сколько", "скольких",
    ].includes(left)
  ) {
    return true
  }

  // 5. Японские именные суффиксы и обращения во всех падежных формах
  if (
    /^(кун|тян|чан|сан|сама|доно|с[еэ]нс[еэ]й|с[еэ]мпай|семпай|кохай|си|д[еэ]нка|х[еэ]нка|онни|оннии|онии|нии|нэ|нээ)[а-яё]*$/i.test(
      right
    )
  ) {
    return true
  }

  // 6. Иноязычные и составные приставки перед дефисом
  if (
    [
      "интернет", "онлайн", "веб", "мини", "макси", "миди", "микро", "макро", "топ",
      "бизнес", "пресс", "экс", "вице", "лейб", "обер", "унтер", "штаб", "генерал",
      "премьер", "мастер", "шоу", "арт", "поп", "рок", "джаз", "спа", "фитнес", "эко",
      "кибер", "медиа", "аудио", "видео", "стерео", "супер", "ультра", "экстра", "гипер",
      "мега", "псевдо", "квази", "пол", "полу", "кое", "кой",
    ].includes(left)
  ) {
    return true
  }

  // 7. Наречия с приставкой по- (-ому, -ему, -ски, -цки, -ьи, -ески) и в-/во- (-ых, -их)
  if (
    left === "по" &&
    (right.endsWith("ски") ||
      right.endsWith("цки") ||
      right.endsWith("ьи") ||
      right.endsWith("ому") ||
      right.endsWith("ему") ||
      right.endsWith("ески") ||
      ["русски", "немецки", "английски", "японски", "французски", "птичьи", "волчьи"].includes(right))
  ) {
    return true
  }
  if ((left === "во" || left === "в") && (right.endsWith("ых") || right.endsWith("их"))) {
    return true
  }

  // 8. Составные предлоги и междометия
  if (
    (left === "из" && (right === "за" || right === "под")) ||
    (left === "по" && (right === "над" || right === "за")) ||
    left === right // Повторы: еле-еле, чуть-чуть, давным-давно, точь-в-точь, синий-синий
  ) {
    return true
  }

  // 9. Сложные прилагательные и существительные (светло-синий, юго-запад, чудо-оружие, плащ-палатка)
  if (
    left.length >= 3 &&
    right.length >= 3 &&
    /[оеёа-яА-Я]$/.test(left) &&
    /^(светло|темно|тёмно|ярко|бледно|мутно|нежно|густо|слабо|резко|остро|кисло|горько|сладко|солено|солёно|северо|юго|западно|восточно|верхне|нижне|средне|ранне|поздне|древне|старо|ново|мало|много|крупно|мелко|узко|широко|высоко|низко|глубоко|далеко|близко|быстро|медленно|громко|тихо|чудо|горе|жар|птица|диван|кресло|плащ|школа|кафе|матч|бой|шеф|бизнес|пресс|рок|поп|фан|арт|спа)$/.test(
      left
    )
  ) {
    return true
  }

  return false
}

/**
 * Склеивает строки обратно в поток слов, убирая мягкие слоговые дефисы,
 * но СТРОГО сохраняя дефисы во всех двусоставных словах и именах.
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
      const nextWords = line.split(/\s+/)
      const rawFirstNextWord = nextWords[0] || ""

      if (isCompoundHyphenPair(rawLastPrevWord, rawFirstNextWord)) {
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

  // Шаг 1: Приклеиваем только закрывающие тире/частицы ("ли", "же", "бы", "б") к предыдущему слову
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

  // Шаг 2: Дефисные составные слова («Ямада-сэмпай», «интернет-кафе») делим на самостоятельные части
  // ["Ямада-", "сэмпай"], чтобы их можно было переносить по дефису без уменьшения кегля
  // ПРИМЕЧАНИЕ: Предлоги («из», «в», «на») НЕ свариваются намертво со следующим словом,
  // что позволяет свободно переносить их по строкам
  const step2: string[] = []
  for (const token of step1) {
    if (token.includes("-") && !token.endsWith("-") && token.length >= 6) {
      const dashIdx = token.indexOf("-")
      const leftPart = token.slice(0, dashIdx + 1)
      const rightPart = token.slice(dashIdx + 1)
      const cleanLeftWord = leftPart.split(/\s+/).pop()?.slice(0, -1) || ""
      const cleanRightWord = rightPart.replace(/[.,!?:;…«»"'\)\]]+$/g, "")

      if (cleanLeftWord.length >= 2 && cleanRightWord.length >= 2) {
        step2.push(leftPart, rightPart)
        continue
      }
    }
    step2.push(token)
  }

  return step2
}

function expandOversizedTokens(
  ctx: CanvasRenderingContext2D,
  tokens: string[],
  maxLineWidth: number,
  minHyphens: boolean
): { units: string[]; isSoftHyphen: boolean[]; hadHyphenation: boolean; hadForcedCharSplit: boolean } {
  const units: string[] = []
  const isSoftHyphen: boolean[] = []
  let hadHyphenation = false
  let hadForcedCharSplit = false

  const queue = [...tokens]

  while (queue.length > 0) {
    const token = queue.shift()!
    if (ctx.measureText(token).width <= maxLineWidth) {
      units.push(token)
      isSoftHyphen.push(false)
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
          isSoftHyphen.push(!sp.isNativeHyphen)
          queue.unshift(cleanLeadingPunct(sp.suffix))
          if (!sp.isNativeHyphen) hadHyphenation = true
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
      isSoftHyphen.push(true)
      queue.unshift(cleanLeadingPunct(token.slice(splitIdx)))
    } else {
      units.push(token)
      isSoftHyphen.push(false)
    }
  }

  return { units, isSoftHyphen, hadHyphenation, hadForcedCharSplit }
}

/**
 * Оценка качества раскладки строк: формирует аккуратный манга-ромб/бочонок.
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
    const idealRatio = 1 - distFromCenter * 0.18
    const actualRatio = w / maxW
    const diff = actualRatio - idealRatio
    penalty += diff * diff * 130

    if (w < avgW * 0.55) {
      penalty += ((avgW * 0.55 - w) / targetMaxW) * 280
    }

    const words = lines[i].split(/\s+/)
    const lastWord = words[words.length - 1]?.replace(/^[«"(\[…]+/, "").toLowerCase()
    // Мягкий штраф за висячий предлог при автобалансировке (не блокирует верстку)
    if (words.length > 1 && NON_BREAKING_PREPOSITIONS.has(lastWord)) {
      penalty += 80
    }
  }

  // Штраф за зажатую узкую строку между широкими
  for (let i = 1; i < n - 1; i++) {
    if (widths[i] < widths[i - 1] * 0.82 && widths[i] < widths[i + 1] * 0.82) {
      penalty += 950
    }
  }

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

/**
 * Вычисляет сохраняемый текст `box.rusText` после ручной правки:
 * если пользователь расставил переносы клавишей Enter, они жестко фиксируются
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

  // Возвращаем заданную пользователем структуру строк напрямую
  return rawEditedLines.join("\n")
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
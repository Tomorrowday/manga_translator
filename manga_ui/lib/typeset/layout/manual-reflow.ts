// manga_ui/lib/typeset/layout/manual-reflow.ts
// Сохранение ручных переносов строк, расставленных пользователем

import { isCompoundHyphenPair, joinLinesRemovingSoftHyphens } from "./compound-words"

/**
 * Невидимый маркер (Word Joiner) в конце текста означает, что пользователь
 * принудительно зафиксировал одну строку: движок не должен разбивать её
 * автоматически, а обязан уменьшать кегль, пока строка не влезет целиком.
 *
 * ВАЖНО: маркер хранится только в `box.rusText` и НИКОГДА не попадает
 * в `<textarea>` (ни в renderedLines, ни в editableLines).
 */
export const FORCED_SINGLE_LINE_MARKER = "\u2060"

interface SoftHyphenPair {
  left: string
  right: string
}

interface SoftHyphenBreak {
  pair: SoftHyphenPair
  lastWord: string
  leftStem: string
  firstWord: string
  restNext: string
  prevLineWithoutLastWord: string
}

export interface ReflowOptions {
  /**
   * Был ли блок ручным до начала правки: в `box.rusText` уже были `\n`
   * или маркер принудительной однострочности.
   */
  wasManualBeforeEdit?: boolean
  /**
   * Менял ли пользователь структуру строк во время этой сессии правки
   * (нажимал Enter или удалял перенос строки через Backspace/Delete).
   */
  hasUserModifiedLineBreaks?: boolean
  /**
   * Был ли у блока маркер `FORCED_SINGLE_LINE_MARKER` до начала правки.
   * Нужен, чтобы восстановить однострочный режим, даже если рендер дал 1 строку.
   */
  hadForcedSingleLine?: boolean
}

/** Есть ли в тексте ручные переносы строк или маркер принудительной однострочности. */
export function hasManualLineBreaks(text: string | null | undefined): boolean {
  if (!text) return false
  return /\r?\n/.test(text) || text.includes(FORCED_SINGLE_LINE_MARKER)
}

/** Убирает невидимый маркер однострочности — для текста, попадающего в textarea. */
export function stripForcedSingleLineMarker(text: string | null | undefined): string {
  return (text || "").split(FORCED_SINGLE_LINE_MARKER).join("")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseSoftHyphenBreak(prevLineRaw: string, nextLineRaw: string): SoftHyphenBreak | null {
  const prevLine = (prevLineRaw || "").trim()
  const nextLine = (nextLineRaw || "").trim()
  if (!prevLine || !nextLine) return null

  const prevWords = prevLine.split(/\s+/)
  const lastWord = prevWords[prevWords.length - 1] || ""
  if (
    !lastWord.endsWith("-") ||
    lastWord.endsWith(" -") ||
    lastWord.endsWith("—") ||
    lastWord.endsWith("–")
  ) {
    return null
  }

  const leftStem = lastWord.slice(0, -1)
  if (!leftStem) return null

  const firstWord = nextLine.split(/\s+/)[0] || ""
  if (!firstWord) return null

  // isCompoundHyphenPair сам срезает окружающую пунктуацию
  if (isCompoundHyphenPair(leftStem, firstWord)) return null

  const cleanLeft = leftStem.replace(/^[«"(\[…\s]+/, "")
  const cleanRight = firstWord
    .replace(/^[«"(\[…\s]+/, "")
    .replace(/[.,!?:;…»"'\)\]]+$/g, "")

  if (!cleanLeft || !cleanRight) return null

  return {
    pair: { left: cleanLeft, right: cleanRight },
    lastWord,
    leftStem,
    firstWord,
    restNext: nextLine.slice(firstWord.length).trim(),
    prevLineWithoutLastWord: prevLine.slice(0, prevLine.length - lastWord.length),
  }
}

/**
 * Собирает пары «мягкий слоговой перенос» из уже отрисованных строк.
 * Пример: ["При-", "вет"] -> { left: "При", right: "вет" }.
 * Истинные дефисные слова ("Макима-сан", "кто-то", "точь-в-точь") пропускаются.
 */
function collectSoftHyphenPairs(lines: string[]): SoftHyphenPair[] {
  const pairs: SoftHyphenPair[] = []

  for (let i = 0; i < lines.length - 1; i++) {
    const info = parseSoftHyphenBreak(lines[i], lines[i + 1])
    if (info) pairs.push(info.pair)
  }

  return pairs
}

/**
 * Склеивает обратно мягко перенесённое слово, если пользователь убрал
 * перенос строки и теперь части стоят рядом внутри одной строки:
 * "При- вет" / "При-вет" -> "Привет".
 *
 * Вторая половина слова могла быть отредактирована ("При-ветик"), поэтому
 * проверяем не точное совпадение `pair.right`, а произвольный хвост слова,
 * и склеиваем только если это не настоящее двусоставное слово.
 */
function normalizeSoftHyphensInLine(line: string, pairs: SoftHyphenPair[]): string {
  let result = line

  for (const pair of pairs) {
    const left = escapeRegExp(pair.left)
    const re = new RegExp(`(^|[\\s(«"\\[…])(${left})-\\s*([а-яА-ЯёЁa-zA-Z0-9]+)`, "gi")
    result = result.replace(re, (match, prefix: string, tailLeft: string, tailRight: string) => {
      if (isCompoundHyphenPair(tailLeft, tailRight)) return match
      return `${prefix}${tailLeft}${tailRight}`
    })
  }

  return result
}

/**
 * Убирает «висячий» мягкий дефис в конце строки, если вторая половина слова
 * больше не начинается со следующей строки. Пример: было ["При-", "вет"],
 * пользователь оставил "При-" в конце строки, но следующая строка теперь
 * начинается с другого слова — дефис от старой вёрстки снимается.
 */
function normalizeCrossLineSoftHyphens(lines: string[], pairs: SoftHyphenPair[]): string[] {
  const result = [...lines]

  for (const pair of pairs) {
    const leftRe = new RegExp(`(^|[\\s(«"\\[…])${escapeRegExp(pair.left)}-$`, "i")
    const rightRe = new RegExp(`^[\\s(«"\\[…]*${escapeRegExp(pair.right)}`, "i")

    for (let i = 0; i < result.length; i++) {
      if (!leftRe.test(result[i])) continue

      const nextLine = result[i + 1] || ""
      if (nextLine && rightRe.test(nextLine)) continue

      result[i] = result[i].replace(/-$/, "")
    }
  }

  return result
}

/**
 * Вычисляет сохраняемый текст `box.rusText` после правки в textarea.
 *
 * Главное правило: авто-бабл должен остаться авто-баблом, если пользователь
 * не менял структуру строк. Исправление опечатки или дописывание слова
 * склеивает строки обратно в один поток (`joinLinesRemovingSoftHyphens`),
 * чтобы движок сам красиво перебалансировал текст.
 *
 * Ручные `\n` фиксируются только если блок был ручным до правки или
 * пользователь нажал Enter / удалил перенос строки.
 *
 * `editedText` всегда приходит из `<textarea>` и не содержит невидимого маркера;
 * маркер однострочности добавляется только в возвращаемый storage-текст.
 */
export function reflowFromManualLines(
  previousRenderedLines: string[],
  editedText: string,
  options: boolean | ReflowOptions = true
): string {
  const opts: ReflowOptions = typeof options === "boolean" ? { wasManualBeforeEdit: options } : options
  const wasManualBeforeEdit = opts.wasManualBeforeEdit ?? true
  const hasUserModifiedLineBreaks = opts.hasUserModifiedLineBreaks ?? false
  const hadForcedSingleLine = opts.hadForcedSingleLine ?? false

  // На случай, если маркер всё же оказался во входном тексте (старый код/undo).
  const hadExplicitMarker = editedText.includes(FORCED_SINGLE_LINE_MARKER)
  const withoutMarker = editedText.split(FORCED_SINGLE_LINE_MARKER).join("")

  const rawEditedLines = withoutMarker
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (rawEditedLines.length === 0) return ""

  const softPairs = collectSoftHyphenPairs(previousRenderedLines)
  const normalizedLines = normalizeCrossLineSoftHyphens(
    rawEditedLines
      .map((line) => normalizeSoftHyphensInLine(line, softPairs).trim())
      .filter(Boolean),
    softPairs
  )

  if (normalizedLines.length === 0) return ""

  const isManualLayout = wasManualBeforeEdit || hasUserModifiedLineBreaks

  // Авто-режим: пользователь не трогал разбивку строк — отдаём текст одним
  // потоком, чтобы авто-движок заново разложил его ромбом.
  if (!isManualLayout) {
    return joinLinesRemovingSoftHyphens(normalizedLines)
  }

  const forceSingleLine =
    normalizedLines.length === 1 &&
    (hadExplicitMarker || hadForcedSingleLine || previousRenderedLines.length > 1)

  return normalizedLines.join("\n") + (forceSingleLine ? FORCED_SINGLE_LINE_MARKER : "")
}

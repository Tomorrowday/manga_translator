// manga_ui/lib/typeset/layout/tokenizer.ts
// Токенизация манга-фразы: склейка частиц, деление дефисных слов и дробление слишком длинных токенов

import { cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe } from "../hyphenation"

// Короткие предлоги, союзы и частицы для мягкого балансирования (без принудительной склейки)
export const NON_BREAKING_PREPOSITIONS = new Set([
  "а", "в", "и", "к", "о", "с", "у", "я",
  "не", "ни", "на", "но", "по", "за", "из", "от", "до", "во", "со", "ко", "об",
  "ну", "ах", "ох", "эх", "уж", "ух",
])

// Частицы и тире, приклеивающиеся к предыдущему слову
export const ATTACH_TO_PREV_WORDS = new Set(["—", "–", "-", "же", "бы", "б", "ли", "ль"])

const DASH_ONLY_RE = /^[-—–−]+$/

const HYPHENATED_WORD_RE =
  /^([^а-яА-ЯёЁa-zA-Z0-9]*)([а-яА-ЯёЁa-zA-Z0-9]+(?:-[а-яА-ЯёЁa-zA-Z0-9]+)+)(.*)$/

/**
 * Делит слово по ВСЕМ внутренним дефисам, сохраняя дефис на левой части.
 * Короткие однобуквенные вставки приклеиваются к левой части:
 *   "точь-в-точь" -> ["точь-в-", "точь"]
 *   "рок-н-ролл"  -> ["рок-н-", "ролл"]
 *   "кто-нибудь-то" -> ["кто-", "нибудь-", "то"]
 */
function splitHyphenatedToken(token: string): string[] | null {
  if (!token.includes("-") || token.endsWith("-") || token.length < 6) return null

  const match = token.match(HYPHENATED_WORD_RE)
  if (!match) return null

  const leadPunct = match[1]
  const core = match[2]
  const trailPunct = match[3]
  const parts = core.split("-")
  if (parts.length < 2) return null

  const segments: string[] = []
  let acc = `${leadPunct}${parts[0]}`

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]

    // Однобуквенные вставки (-в-, -н-) остаются с левой частью
    if (part.length < 2) {
      acc += `-${part}`
      continue
    }

    const leftCore = acc.replace(/^[^а-яА-ЯёЁa-zA-Z0-9]*/, "")
    if (leftCore.replace(/-/g, "").length < 2) {
      acc += `-${part}`
      continue
    }

    segments.push(`${acc}-`)
    acc = part
  }

  segments.push(`${acc}${trailPunct}`)

  return segments.length > 1 ? segments : null
}

export function cleanAndTrimLines(rawLines: string[]): string[] {
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

export function tokenizeMangaPhrase(text: string): string[] {
  const rawTokens = text.trim().split(/\s+/).filter(Boolean)
  if (rawTokens.length === 0) return []

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

  // Тире в начале реплики ("— Привет") не должно отрываться от первого слова.
  // Внутри фразы тире уже приклеено к предыдущему слову и остаётся в конце строки.
  for (let i = 0; i < step1.length - 1; i++) {
    if (DASH_ONLY_RE.test(step1[i].trim())) {
      step1[i + 1] = `${step1[i]} ${step1[i + 1]}`
      step1.splice(i, 1)
      i--
    }
  }

  // Шаг 2: Дефисные составные слова («Ямада-сэмпай», «интернет-кафе», «точь-в-точь»)
  // делим на самостоятельные части ["Ямада-", "сэмпай"], чтобы их можно было переносить
  // по дефису без уменьшения кегля. Разбиение идёт по ВСЕМ внутренним дефисам.
  // ПРИМЕЧАНИЕ: Предлоги («из», «в», «на») НЕ свариваются намертво со следующим словом,
  // что позволяет свободно переносить их по строкам
  const step2: string[] = []
  for (const token of step1) {
    const hyphenParts = splitHyphenatedToken(token)
    if (hyphenParts) {
      step2.push(...hyphenParts)
    } else {
      step2.push(token)
    }
  }

  return step2
}

export function expandOversizedTokens(
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

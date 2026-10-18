// lib/typeset/hyphenation.ts
// Алгоритм русской слогоразбивки и переносов по правилам русской орфографии (ПАС)

const RUS_VOWELS = new Set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
const RUS_CONSONANTS = new Set("бвгджзклмнпрстфхцчшщБВГДЖЗКЛМНПРСТФХЦЧШЩ")
const RUS_SIGNS = new Set("ьъйЬЪЙ")
const RUS_SONORANTS = new Set("рлмнйРЛМНЙ")

export function appendHyphenSafe(str: string): string {
  if (!str) return str
  const trimmed = str.trimEnd()
  const lastChar = trimmed[trimmed.length - 1]
  if (/[-—–−.,!?:;…«»"'\)\]]/.test(lastChar)) {
    return trimmed
  }
  return trimmed + "-"
}

export function cleanLeadingPunct(str: string): string {
  if (!str) return str
  // Если строка состоит только из дефисов, тире или пробелов (например, отдельное "—"), не стираем её
  if (/^[-—–−\s]+$/.test(str)) {
    return str.trim()
  }
  return str.replace(/^[-—–−\s]+/, "")
}

function hasVowel(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (RUS_VOWELS.has(s[i])) return true
  }
  return false
}

export function getWordHyphenSplits(word: string): Array<{ prefix: string; suffix: string }> {
  // 1. Если в слове уже есть дефис (например: "где-то", "темно-синий") — делим по нему
  if (word.includes("-")) {
    const dashIdx = word.indexOf("-")
    const pfx = word.slice(0, dashIdx + 1)
    const sfx = cleanLeadingPunct(word.slice(dashIdx + 1))
    if (pfx && sfx && pfx.length >= 2 && sfx.length >= 2) {
      return [{ prefix: pfx, suffix: sfx }]
    }
  }

  // Выделяем ведущую пунктуацию, корневую буквенную часть и хвостовую пунктуацию
  const match = word.match(/^([.«"(\[…\s]*)([а-яА-ЯёЁa-zA-Z]+)(.*)$/)
  if (!match) return []

  const leadPunct = match[1]
  const core = match[2]
  const trailPunct = match[3]

  // По правилам переноса: минимум 4 буквы в слове (по 2 буквы с каждой стороны)
  if (core.length < 4) return []

  const splits: Array<{ prefix: string; suffix: string }> = []
  const n = core.length

  for (let i = 1; i <= n - 2; i++) {
    const leftPart = core.slice(0, i)
    const rightPart = core.slice(i)

    // Правило 1: Нельзя оставлять или переносить 1 букву
    if (leftPart.length < 2 || rightPart.length < 2) continue

    // Правило 2: В обеих частях слова обязательно должна быть хотя бы одна гласная
    if (!hasVowel(leftPart) || !hasVowel(rightPart)) continue

    const charBefore = core[i - 1]
    const charAfter = core[i]

    // Правило 3: Знаки ь, ъ, й никогда не отрываются от предшествующей буквы
    if (RUS_SIGNS.has(charAfter)) continue

    // Правило 4: Не отрывать согласную от следующей за ней гласной, если перед ней гласная (гла-за, а не гл-аза)
    if (RUS_VOWELS.has(charBefore) && RUS_VOWELS.has(charAfter)) {
      // Перенос между двумя гласными допустим (ха-ос, на-ука)
      const prefix = appendHyphenSafe(leadPunct + leftPart)
      const suffix = cleanLeadingPunct(rightPart + trailPunct)
      splits.push({ prefix, suffix })
      continue
    }

    // Правило 5: Стык удвоенных согласных разрывается (мас-са, рус-ский)
    if (
      charBefore.toLowerCase() === charAfter.toLowerCase() &&
      RUS_CONSONANTS.has(charBefore)
    ) {
      const prefix = appendHyphenSafe(leadPunct + leftPart)
      const suffix = cleanLeadingPunct(rightPart + trailPunct)
      splits.push({ prefix, suffix })
      continue
    }

    // Правило 6: Сонорная согласная (р, л, м, н, й) перед шумной согласной отходит влево (пар-та, пол-ка, бан-ка)
    if (RUS_SONORANTS.has(charBefore) && RUS_CONSONANTS.has(charAfter)) {
      const prefix = appendHyphenSafe(leadPunct + leftPart)
      const suffix = cleanLeadingPunct(rightPart + trailPunct)
      splits.push({ prefix, suffix })
      continue
    }

    // Правило 7: Базовый слогораздел — после гласной перед согласной (ко-ро-ва)
    if (RUS_VOWELS.has(charBefore) && RUS_CONSONANTS.has(charAfter)) {
      const prefix = appendHyphenSafe(leadPunct + leftPart)
      const suffix = cleanLeadingPunct(rightPart + trailPunct)
      splits.push({ prefix, suffix })
      continue
    }

    // Правило 8: Перенос между группой шумных согласных (сес-тра или се-стра)
    if (RUS_CONSONANTS.has(charBefore) && RUS_CONSONANTS.has(charAfter)) {
      const prefix = appendHyphenSafe(leadPunct + leftPart)
      const suffix = cleanLeadingPunct(rightPart + trailPunct)
      splits.push({ prefix, suffix })
      continue
    }
  }

  // Возвращаем варианты от самых длинных префиксов к коротким
  return splits.reverse()
}
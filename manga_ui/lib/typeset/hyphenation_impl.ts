// manga_ui/lib/typeset/hyphenation_impl.ts
// Алгоритм русской слогоразбивки и переносов по правилам русской орфографии (ПАС)

const RUS_VOWELS = new Set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
const RUS_CONSONANTS = new Set("бвгджзклмнпрстфхцчшщБВГДЖЗКЛМНПРСТФХЦЧШЩ")
const RUS_SIGNS = new Set("ьъйЬЪЙ")
const RUS_MODIFIERS = new Set("ьъЬЪ")
const RUS_YOT = new Set("йЙ")
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

function isConsonantOrSign(ch: string): boolean {
  return RUS_CONSONANTS.has(ch) || RUS_SIGNS.has(ch)
}

function findRussianCoreSplitIndices(core: string): number[] {
  const n = core.length
  if (n < 4) return []

  const indices: number[] = []

  for (let i = 2; i <= n - 2; i++) {
    const leftPart = core.slice(0, i)
    const rightPart = core.slice(i)

    // Правило 1: В обеих частях слова обязательно должна быть хотя бы одна гласная
    if (!hasVowel(leftPart) || !hasVowel(rightPart)) continue

    const charBefore = core[i - 1]
    const charAfter = core[i]

    // Правило 2: Знаки ь, ъ, й никогда не отрываются от предшествующей буквы
    if (RUS_SIGNS.has(charAfter)) continue

    // Правило 3: Одиночная согласная между двумя гласными не отрывается от следующей гласной (ко-ро-ва, а не кор-ова)
    if (RUS_CONSONANTS.has(charBefore) && RUS_VOWELS.has(charAfter)) {
      const prevPrev = i >= 2 ? core[i - 2] : ""
      if (RUS_VOWELS.has(prevPrev) || RUS_MODIFIERS.has(prevPrev)) {
        continue
      }
    }

    // Правило 4: Перенос после ь и ъ (маль-чик, боль-шой, подъ-езд, объ-явление)
    if (RUS_MODIFIERS.has(charBefore)) {
      indices.push(i)
      continue
    }

    // Правило 5: Перенос после "й" перед согласной (вой-на, тай-на, май-ка, сей-час)
    if (RUS_YOT.has(charBefore) && RUS_CONSONANTS.has(charAfter)) {
      indices.push(i)
      continue
    }

    // Правило 6: Стык двух гласных (на-ука, по-эзия, ха-ос)
    if (RUS_VOWELS.has(charBefore) && RUS_VOWELS.has(charAfter)) {
      indices.push(i)
      continue
    }

    // Правило 7: Открытый слог — после гласной перед согласной (мо-ло-ко, пе-ре-ма-ты-ва-ла)
    if (RUS_VOWELS.has(charBefore) && RUS_CONSONANTS.has(charAfter)) {
      indices.push(i)
      continue
    }

    // Правило 8: Стык удвоенных согласных (мас-са, рус-ский, груп-па)
    if (
      RUS_CONSONANTS.has(charBefore) &&
      RUS_CONSONANTS.has(charAfter) &&
      charBefore.toLowerCase() === charAfter.toLowerCase()
    ) {
      indices.push(i)
      continue
    }

    // Правило 9: Сонорная согласная перед другой согласной (пар-та, пол-ка, бан-ка, свадь-бе)
    if (RUS_SONORANTS.has(charBefore) && RUS_CONSONANTS.has(charAfter)) {
      indices.push(i)
      continue
    }

    // Правило 10: Стечение шумных согласных (сес-тра, под-толк-нуть), кроме оставления двойных согласных в начале переноса
    if (RUS_CONSONANTS.has(charBefore) && RUS_CONSONANTS.has(charAfter)) {
      const nextAfter = i + 1 < n ? core[i + 1] : ""
      if (
        nextAfter &&
        RUS_CONSONANTS.has(nextAfter) &&
        charAfter.toLowerCase() === nextAfter.toLowerCase()
      ) {
        continue
      }
      if (isConsonantOrSign(charBefore) && isConsonantOrSign(charAfter)) {
        indices.push(i)
        continue
      }
    }
  }

  return indices
}

export function getWordHyphenSplits(word: string): Array<{ prefix: string; suffix: string }> {
  if (!word || word.length < 4) return []

  const match = word.match(/^([.«"(\[…\s]*)([а-яА-ЯёЁa-zA-Z]+(?:-[а-яА-ЯёЁa-zA-Z]+)*)(.*)$/)
  if (!match) return []

  const leadPunct = match[1]
  const fullCore = match[2]
  const trailPunct = match[3]

  const splits: Array<{ prefix: string; suffix: string }> = []
  const parts = fullCore.split("-")

  let accumulatedLeft = ""
  for (let pIdx = 0; pIdx < parts.length; pIdx++) {
    const part = parts[pIdx]
    const remainingRightParts = parts.slice(pIdx + 1).join("-")
    const rightTail = remainingRightParts ? "-" + remainingRightParts + trailPunct : trailPunct

    if (part.length >= 4) {
      const indices = findRussianCoreSplitIndices(part)
      for (const idx of indices) {
        const subLeft = part.slice(0, idx)
        const subRight = part.slice(idx)
        const prefix = appendHyphenSafe(leadPunct + accumulatedLeft + subLeft)
        const suffix = cleanLeadingPunct(subRight + rightTail)
        if (prefix && suffix) {
          splits.push({ prefix, suffix })
        }
      }
    }

    if (pIdx < parts.length - 1) {
      const leftWithDash = accumulatedLeft + part + "-"
      if (part.length >= 2 && remainingRightParts.length >= 2) {
        splits.push({
          prefix: leadPunct + leftWithDash,
          suffix: cleanLeadingPunct(remainingRightParts + trailPunct),
        })
      }
      accumulatedLeft = leftWithDash
    }
  }

  return splits.reverse()
}
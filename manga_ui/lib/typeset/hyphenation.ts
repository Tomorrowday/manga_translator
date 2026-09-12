// lib/typeset/hyphenation.ts
// Алгоритм русской слогоразбивки и переносов для верстки в баблах

const RUS_VOWELS = new Set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
const RUS_SIGNS = new Set("ьъйЬЪЙ")

export function appendHyphenSafe(str: string): string {
  if (!str) return str
  const trimmed = str.trimEnd()
  const lastChar = trimmed[trimmed.length - 1]
  if (/[-—–.,!?:;…«»"'\)\]]/.test(lastChar)) {
    return trimmed
  }
  return trimmed + "-"
}

export function cleanLeadingPunct(str: string): string {
  return str.replace(/^[-—–\s]+/, "")
}

export function getWordHyphenSplits(word: string): Array<{ prefix: string; suffix: string }> {
  if (word.includes("-")) {
    const dashIdx = word.indexOf("-")
    const pfx = word.slice(0, dashIdx + 1)
    const sfx = cleanLeadingPunct(word.slice(dashIdx + 1))
    if (pfx && sfx) {
      return [{ prefix: pfx, suffix: sfx }]
    }
  }

  const match = word.match(/^([.«"(\[…\s]*)([а-яА-ЯёЁa-zA-Z]+)(.*)$/)
  if (!match) return []

  const leadPunct = match[1]
  const core = match[2]
  const trailPunct = match[3]

  if (core.length < 4) return []

  const splits: Array<{ prefix: string; suffix: string }> = []
  let vowelsBefore = 0

  for (let i = 0; i < core.length; i++) {
    if (RUS_VOWELS.has(core[i])) vowelsBefore++

    if (i < 1 || i >= core.length - 2) continue
    if (vowelsBefore === 0) continue

    const nextChar = core[i + 1]
    if (RUS_SIGNS.has(nextChar)) continue

    let vowelsAfter = 0
    for (let j = i + 1; j < core.length; j++) {
      if (RUS_VOWELS.has(core[j])) vowelsAfter++
    }
    if (vowelsAfter === 0) continue

    const prefix = appendHyphenSafe(leadPunct + core.slice(0, i + 1))
    const suffix = cleanLeadingPunct(core.slice(i + 1) + trailPunct)
    splits.push({ prefix, suffix })
  }

  return splits.reverse()
}
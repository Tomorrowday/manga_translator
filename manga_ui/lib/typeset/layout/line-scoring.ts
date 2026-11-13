// manga_ui/lib/typeset/layout/line-scoring.ts
// Оценка качества раскладки строк: манга-ромб, штрафы за висячие предлоги и зажатые строки

import { NON_BREAKING_PREPOSITIONS } from "./tokenizer"

/**
 * Оценка качества раскладки строк: формирует аккуратный манга-ромб/бочонок.
 */
export function scoreMangaLinesConfiguration(
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

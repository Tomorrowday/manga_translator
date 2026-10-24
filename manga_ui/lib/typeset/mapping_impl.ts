// manga_ui/lib/typeset/mapping_impl.ts
// Преобразование моделей данных, компаратор порядка чтения манги и алгоритм умного вклинивания блоков

import type { TextBlock } from "../types"
import type { BoxGeometry } from "./mapping"

/**
 * Относительный компаратор порядка чтения манги (Manga Reading Order):
 * Возвращает:
 * < 0: блок A читается раньше блока B
 * > 0: блок B читается раньше блока A
 *   0: эквивалентны
 */
export function compareMangaBlocks(a: BoxGeometry, b: BoxGeometry): number {
  const hA = Math.max(0.005, a.height || 0.05)
  const hB = Math.max(0.005, b.height || 0.05)
  const wA = Math.max(0.005, a.width || 0.05)
  const wB = Math.max(0.005, b.width || 0.05)

  const topA = a.y
  const bottomA = a.y + hA
  const topB = b.y
  const bottomB = b.y + hB

  const cyA = a.y + hA / 2
  const cyB = b.y + hB / 2

  const cxA = a.x + wA / 2
  const cxB = b.x + wB / 2

  // 1. Вычисляем вертикальное перекрытие двух блоков
  const overlapY = Math.max(0, Math.min(bottomA, bottomB) - Math.max(topA, topB))
  const minHeight = Math.min(hA, hB)
  const overlapRatio = minHeight > 0 ? overlapY / minHeight : 0

  // 2. Блоки считаются одним ярусом (одной строкой / панелью), если:
  //    - их вертикальное перекрытие более 30% от высоты меньшего блока, либо
  //    - расстояние между их центрами по Y меньше 4% высоты страницы.
  const isSameRow = overlapRatio >= 0.3 || Math.abs(cyA - cyB) < 0.04

  if (isSameRow) {
    // В манге внутри одного яруса читают СПРАВА НАЛЕВО (больший X читается раньше)
    const diffX = cxB - cxA
    if (Math.abs(diffX) > 0.005) {
      return diffX
    }
    // Если по X почти на одной линии — тот, что чуть выше, читается раньше
    return cyA - cyB
  }

  // 3. Блоки на разных ярусах: читаем СВЕРХУ ВНИЗ
  return cyA - cyB
}

/**
 * Находит оптимальный индекс вставки нового блока в уже существующий список
 * без разрушения пользовательского порядка существующих блоков.
 * Использует алгоритм минимизации перестановок (Optimal Rank Insertion).
 */
export function findMangaInsertionIndex<T extends BoxGeometry>(
  existingBlocks: T[],
  newBlock: T
): number {
  const n = existingBlocks.length
  if (n === 0) return 0

  // Сравниваем newBlock с каждым существующим блоком:
  // shouldBeBefore[i] = true, если newBlock должен читаться раньше existingBlocks[i]
  const shouldBeBefore: boolean[] = existingBlocks.map(
    (b) => compareMangaBlocks(newBlock, b) < 0
  )

  let bestIndex = 0
  let minPenalty = Infinity

  // Перебираем все возможные позиции вставки от 0 до N
  for (let k = 0; k <= n; k++) {
    let penalty = 0

    // Для элементов до индекса k: они должны идти ДО newBlock.
    for (let j = 0; j < k; j++) {
      if (shouldBeBefore[j]) penalty++
    }

    // Для элементов после индекса k: они должны идти ПОСЛЕ newBlock.
    for (let j = k; j < n; j++) {
      if (!shouldBeBefore[j]) penalty++
    }

    if (penalty < minPenalty) {
      minPenalty = penalty
      bestIndex = k
    }
  }

  return bestIndex
}

/**
 * Умная вставка нового блока в список:
 * Новый блок вклинивается на оптимальную позицию,
 * порядок всех остальных блоков сохраняется неизменным,
 * а orderIndex пересчитывается по порядку следования.
 */
export function insertBlockInMangaOrder(
  existingBlocks: TextBlock[],
  newBlock: TextBlock
): TextBlock[] {
  const insertIdx = findMangaInsertionIndex(existingBlocks, newBlock)
  const result = [...existingBlocks]
  result.splice(insertIdx, 0, newBlock)

  return result.map((b, idx) => ({
    ...b,
    orderIndex: idx + 1,
  }))
}

/**
 * Первоначальная сортировка баблов страницы (при автодетекте)
 */
export function sortBlocksMangaOrder<T extends BoxGeometry>(boxes: T[]): T[] {
  return [...boxes].sort((a, b) => compareMangaBlocks(a, b))
}

export function mapDbBlockToTextBlock(b: any, cropDataUrl: string = ""): TextBlock {
  return {
    id: b.id,
    class_id: b.class_id ?? 0,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    rotation: Number(b.rotation) || 0,
    japText: b.jap_text || "",
    rusText: b.rus_text || "",
    speaker: b.speaker || "",
    orderIndex: b.order_index || 0,
    fontSize: b.font_size,
    fontFamily: b.font_family || "v_CCFaceFront",
    isBold: Boolean(b.is_bold),
    isItalic: Boolean(b.is_italic),
    isUppercase: Boolean(b.is_uppercase),
    hasStroke: Boolean(b.has_stroke),
    textColor: (b.text_color as "black" | "white") || "black",
    shape: (b.shape as TextBlock["shape"]) || "rect",
    paddingMode: (b.padding_mode as TextBlock["paddingMode"]) || "safe",
    minHyphens: b.min_hyphens !== undefined ? Boolean(b.min_hyphens) : true,
    status: (b.status as TextBlock["status"]) || "new",
    imageCrop: cropDataUrl,
  }
}
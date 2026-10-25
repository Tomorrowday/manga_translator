// manga_ui/lib/typeset/mapping_impl.ts
// Преобразование моделей данных БД в UI с защитой от nullpx, сортировка и вклинивание блоков

import type { TextBlock, BlockShape, PaddingMode, TextColor } from "@/lib/types"

export interface BoxGeometry {
  x: number
  y: number
  width?: number
  height?: number
}

export function compareMangaBlocks(a: BoxGeometry, b: BoxGeometry): number {
  const aCenterY = a.y + (a.height ? a.height / 2 : 0)
  const bCenterY = b.y + (b.height ? b.height / 2 : 0)

  const yDiff = aCenterY - bCenterY

  // Если баблы находятся на одной вертикальной полосе (разница по высоте < 70px)
  if (Math.abs(yDiff) < 70) {
    const aCenterX = a.x + (a.width ? a.width / 2 : 0)
    const bCenterX = b.x + (b.width ? b.width / 2 : 0)
    // В манге читаем справа налево
    return bCenterX - aCenterX
  }

  // Иначе читаем сверху вниз
  return yDiff
}

export function findMangaInsertionIndex(blocks: TextBlock[], newBlock: TextBlock): number {
  if (blocks.length === 0) return 0

  let low = 0
  let high = blocks.length

  while (low < high) {
    const mid = (low + high) >>> 1
    if (compareMangaBlocks(blocks[mid], newBlock) < 0) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

export function insertBlockInMangaOrder(blocks: TextBlock[], newBlock: TextBlock): TextBlock[] {
  const index = findMangaInsertionIndex(blocks, newBlock)
  const next = [...blocks]
  next.splice(index, 0, newBlock)
  return next.map((b, i) => ({ ...b, orderIndex: i + 1 }))
}

export function sortBlocksMangaOrder(blocks: TextBlock[]): TextBlock[] {
  const sorted = [...blocks].sort(compareMangaBlocks)
  return sorted.map((b, i) => ({ ...b, orderIndex: i + 1 }))
}

export function mapDbBlockToTextBlock(dbBlock: any): TextBlock {
  // Фикс nullpx: если в базе значение NULL или не число, строго ставим undefined (режим Auto)
  const parsedFontSize =
    dbBlock.font_size !== null && dbBlock.font_size !== undefined && !Number.isNaN(Number(dbBlock.font_size))
      ? Number(dbBlock.font_size)
      : undefined

  return {
    id: String(dbBlock.id),
    class_id: dbBlock.class_id ?? 0,
    x: Number(dbBlock.x) || 0,
    y: Number(dbBlock.y) || 0,
    width: Number(dbBlock.width) || 0,
    height: Number(dbBlock.height) || 0,
    rotation: Number(dbBlock.rotation) || 0,
    japText: dbBlock.jap_text || "",
    rusText: dbBlock.rus_text || "",
    speaker: dbBlock.speaker || "",
    orderIndex: Number(dbBlock.order_index) || 0,
    status: dbBlock.status || (dbBlock.rus_text ? "translated" : dbBlock.jap_text ? "ocr-done" : "new"),
    fontSize: parsedFontSize,
    fontFamily: dbBlock.font_family || "v_CCFaceFront",
    isBold: Boolean(dbBlock.is_bold),
    isItalic: Boolean(dbBlock.is_italic),
    isUppercase: Boolean(dbBlock.is_uppercase),
    hasStroke: Boolean(dbBlock.has_stroke),
    textColor: (dbBlock.text_color || "black") as TextColor,
    shape: (dbBlock.shape || "rect") as BlockShape,
    paddingMode: (dbBlock.padding_mode || "safe") as PaddingMode,
    minHyphens: dbBlock.min_hyphens !== undefined ? Boolean(dbBlock.min_hyphens) : true,
  }
}
// lib/typeset/mapping.ts
// Преобразование моделей данных и правила порядка чтения манги

import type { TextBlock } from "../types"

export function sortBlocksMangaOrder<T extends { x: number; y: number }>(blocks: T[]): T[] {
  const rowHeight = 0.18
  return [...blocks].sort((a, b) => {
    const rowA = Math.floor(a.y / rowHeight)
    const rowB = Math.floor(b.y / rowHeight)
    if (rowA !== rowB) {
      return rowA - rowB
    }
    return b.x - a.x
  })
}

export function mapDbBlockToTextBlock(b: any, cropDataUrl: string = ""): TextBlock {
  return {
    id: b.id,
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
    shape: (b.shape as TextBlock["shape"]) || "rect",
    paddingMode: (b.padding_mode as TextBlock["paddingMode"]) || "safe",
    status: (b.status as TextBlock["status"]) || "new",
    imageCrop: cropDataUrl,
  }
}
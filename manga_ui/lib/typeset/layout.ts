// manga_ui/lib/typeset/layout.ts
/**
 * Контракт автопереноса строк, подбора кегля под геометрию бабла и оптического центрирования.
 * Реализация: manga_ui/lib/typeset/layout_impl.ts
 */

export interface BubbleLayoutResult {
  lines: string[]
  actualFontSize: number
  lineHeight: number
}

export {
  getEllipseWidthAtY,
  layoutBubbleTextLines,
  reflowFromManualLines,
  joinLinesRemovingSoftHyphens,
} from "./layout_impl"
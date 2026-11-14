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

export type { ReflowOptions } from "./layout_impl"

export {
  getEllipseWidthAtY,
  layoutBubbleTextLines,
  reflowFromManualLines,
  joinLinesRemovingSoftHyphens,
  hasManualLineBreaks,
  stripForcedSingleLineMarker,
  FORCED_SINGLE_LINE_MARKER,
} from "./layout_impl"
// manga_ui/lib/typeset/layout.ts
/**
 * Контракт автопереноса строк, подбора кегля под геометрию бабла и оптического центрирования.
 * Реализация: manga_ui/lib/typeset/layout_impl.ts
 * Зависимости реализации: manga_ui/lib/typeset/hyphenation (cleanLeadingPunct, getWordHyphenSplits, appendHyphenSafe)
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
} from "./layout_impl"
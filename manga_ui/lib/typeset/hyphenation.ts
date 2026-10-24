// manga_ui/lib/typeset/hyphenation.ts
/**
 * Контракт русской слогоразбивки и орфографических переносов по правилам ПАС.
 * Реализация: manga_ui/lib/typeset/hyphenation_impl.ts
 * Зависимости реализации: регулярные выражения русского языка, константы гласных/согласных/сонорных
 */

export interface WordHyphenSplit {
  prefix: string
  suffix: string
}

export {
  appendHyphenSafe,
  cleanLeadingPunct,
  getWordHyphenSplits,
} from "./hyphenation_impl"
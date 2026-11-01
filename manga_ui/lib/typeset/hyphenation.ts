// manga_ui/lib/typeset/hyphenation.ts
/**
 * Контракт русской слогоразбивки и орфографических переносов по правилам ПАС.
 * Реализация: manga_ui/lib/typeset/hyphenation_impl.ts
 */

export interface WordHyphenSplit {
  prefix: string
  suffix: string
  isNativeHyphen?: boolean
}

export {
  appendHyphenSafe,
  cleanLeadingPunct,
  getWordHyphenSplits,
} from "./hyphenation_impl"
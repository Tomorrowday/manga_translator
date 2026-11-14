// manga_ui/lib/typeset/layout_impl.ts
// Тонкий фасад движка верстки: реализация разложена по модулям в manga_ui/lib/typeset/layout/
//
// Состав пакета:
//   ellipse-geometry.ts    — getEllipseWidthAtY
//   compound-words.ts      — isCompoundHyphenPair, joinLinesRemovingSoftHyphens
//   tokenizer.ts           — NON_BREAKING_PREPOSITIONS, ATTACH_TO_PREV_WORDS,
//                            cleanAndTrimLines, tokenizeMangaPhrase, expandOversizedTokens
//   line-scoring.ts        — scoreMangaLinesConfiguration
//   segment-breaker.ts     — layoutSegmentOptimal, greedyFallbackWithHyphens
//   manual-reflow.ts       — reflowFromManualLines
//   bubble-layout-engine.ts — layoutBubbleTextLines

export * from "./layout/ellipse-geometry"
export * from "./layout/compound-words"
export * from "./layout/tokenizer"
export * from "./layout/line-scoring"
export * from "./layout/segment-breaker"
export * from "./layout/manual-reflow"
export * from "./layout/bubble-layout-engine"

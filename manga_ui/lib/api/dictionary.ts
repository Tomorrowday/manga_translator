// manga_ui/lib/api/dictionary.ts
/**
 * Контракт API-запросов к локальному японско-русскому словарю (Warodai + JMdict + GiNZA/Sudachi + Глоссарий).
 * Реализация: manga_ui/lib/api/dictionary_impl.ts
 */

export interface DictSense {
  source: "warodai" | "jmdict_ru" | "jmdict_en" | "jmnedict" | string
  kanji: string
  reading: string
  pos: string
  meanings: string[]
}

export interface GlossaryHit {
  id: number
  jap_word: string
  rus_word: string
  context: string
}

export interface TokenSpan {
  surface: string
  lemma: string
  reading: string
  pos_ru: string
  inflection_chain: string[]
  is_punct_or_particle: boolean
  ner_label?: string | null
  glossary_match?: GlossaryHit | null
  dict_entries: DictSense[]
}

export interface DictStatusResponse {
  success: boolean
  db_path: string
  total_entries: number
  sources: Record<string, number>
  is_full_dictionary_loaded: boolean
  local_zip_files: string[]
  build_progress: {
    is_building: boolean
    stage: string
    message: string
    error?: string | null
  }
  nlp?: {
    active_backend: string
    has_ahocorasick: boolean
    loaded_ginza_models: string[]
  }
}

export const DICT_GLOSSARY_UPDATED_EVENT = "manga-dict-glossary-updated"

export {
  analyzeBubbleJapText,
  lookupDictionaryWord,
  upsertGlossaryFromDictionary,
  getDictionaryStatus,
  triggerDictionaryBuild,
  clearDictionaryAnalyzeCache,
} from "./dictionary_impl"

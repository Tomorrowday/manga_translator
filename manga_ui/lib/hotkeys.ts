// manga_ui/lib/hotkeys.ts
/**
 * Контракт реестра шрифтов манги, типов горячих клавиш и утилит биндинга.
 * Реализация: manga_ui/lib/hotkeys_impl.ts
 * Зависимости реализации: localStorage, Event, KeyboardEvent
 */

export interface MangaFontOption {
  id: string
  label: string
  index: number
}

export const MANGA_FONTS: MangaFontOption[] = [
  { id: "v_CCFaceFront", label: "v_CCFaceFront (Основной)", index: 1 },
  { id: "v_Augie", label: "v_Augie Regular", index: 2 },
  { id: "v_Blambot Casual", label: "v_Blambot Casual Regular", index: 3 },
  { id: "v_CCYadaYadaYadaInt", label: "v_CCYadaYadaYadaInt Regular", index: 4 },
  { id: "v_Mighty Zeo 2.0", label: "v_Mighty Zeo 2.0 Regular", index: 5 },
  { id: "Betina Script", label: "Betina Script", index: 6 },
  { id: "BirchCTT", label: "BirchCTT Normal", index: 7 },
]

export type HotkeyCategory = "navigation" | "bubble" | "font" | "cleaning" | "tools" | "chapter"

export type HotkeyActionId =
  | "prevPage"
  | "nextPage"
  | "savePage"
  | "toggleViewMode"
  | "toggleTypeset"
  | "font1"
  | "font2"
  | "font3"
  | "font4"
  | "font5"
  | "font6"
  | "font7"
  | "fontSizeUp"
  | "fontSizeDown"
  | "deleteBlock"
  | "moveOrderUp"
  | "moveOrderDown"
  | "toggleShape"
  | "toggleStroke"
  | "togglePadding"
  | "toggleHyphenation"
  | "toggleBold"
  | "toggleItalic"
  | "toggleUppercase"
  | "setClassBubble"
  | "setClassThought"
  | "setClassSfx"
  | "spotWhite"
  | "spotLama"
  | "spotWhiteDel"
  | "spotLamaDel"
  | "brushSizeUp"
  | "brushSizeDown"
  | "chapterDetectAll"
  | "chapterCleanAll"
  | "chapterExportAll"
  | "chapterExportJson"
  | "chapterImportJson"

export interface HotkeyBinding {
  code: string
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
  label: string
  name: string
  category: HotkeyCategory
}

export type HotkeyConfig = Record<HotkeyActionId, HotkeyBinding>

export const HOTKEYS_STORAGE_KEY = "manga_translator_hotkeys_v2"
export const HOTKEYS_UPDATED_EVENT = "hotkeys-updated"

export {
  DEFAULT_HOTKEYS,
  matchHotkey,
  formatKeyEvent,
  loadHotkeys,
  saveHotkeys,
} from "./hotkeys_impl"
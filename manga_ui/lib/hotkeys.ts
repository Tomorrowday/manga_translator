// manga_ui/lib/hotkeys.ts
// ЕДИНЫЙ ЦЕНТР УПРАВЛЕНИЯ ШРИФТАМИ, БИНДАМИ И ХОТКЕЯМИ

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

export const DEFAULT_HOTKEYS: HotkeyConfig = {
  // Навигация и просмотр
  prevPage: { code: "KeyQ", label: "Q", name: "Предыдущая страница", category: "navigation" },
  nextPage: { code: "KeyE", label: "E", name: "Следующая страница", category: "navigation" },
  savePage: { code: "KeyS", ctrl: true, label: "Ctrl+S", name: "Сохранить страницу", category: "navigation" },
  toggleViewMode: { code: "Tab", label: "Tab", name: "Оригинал / Клин", category: "navigation" },
  toggleTypeset: { code: "KeyT", label: "T", name: "Вкл/Выкл Тайпсет", category: "navigation" },

  // Быстрый выбор шрифтов 1..7
  font1: { code: "Digit1", label: "1", name: "Шрифт: CCFaceFront", category: "font" },
  font2: { code: "Digit2", label: "2", name: "Шрифт: Augie", category: "font" },
  font3: { code: "Digit3", label: "3", name: "Шрифт: Blambot Casual", category: "font" },
  font4: { code: "Digit4", label: "4", name: "Шрифт: CCYadaYadaYadaInt", category: "font" },
  font5: { code: "Digit5", label: "5", name: "Шрифт: Mighty Zeo 2.0", category: "font" },
  font6: { code: "Digit6", label: "6", name: "Шрифт: Betina Script", category: "font" },
  font7: { code: "Digit7", label: "7", name: "Шрифт: BirchCTT", category: "font" },
  fontSizeUp: { code: "Equal", label: "+", name: "Увеличить шрифт", category: "font" },
  fontSizeDown: { code: "Minus", label: "-", name: "Уменьшить шрифт", category: "font" },

  // Стили и типы бабла
  setClassBubble: { code: "KeyC", label: "C", name: "Тип: Бабл речи (Класс 0)", category: "bubble" },
  setClassThought: { code: "KeyV", label: "V", name: "Тип: Мысли (Класс 1)", category: "bubble" },
  setClassSfx: { code: "KeyG", label: "G", name: "Тип: Текст / SFX (Класс 2)", category: "bubble" },
  deleteBlock: { code: "Delete", label: "Delete", name: "Удалить бабл", category: "bubble" },
  moveOrderUp: { code: "KeyA", label: "A", name: "Порядок: выше", category: "bubble" },
  moveOrderDown: { code: "KeyD", label: "D", name: "Порядок: ниже", category: "bubble" },
  toggleShape: { code: "KeyR", label: "R", name: "Форма: Овал/Прямоугольник", category: "bubble" },
  toggleStroke: { code: "KeyS", label: "S", name: "Обводка текста", category: "bubble" },
  togglePadding: { code: "KeyF", label: "F", name: "Отступ: Safe/Fit", category: "bubble" },
  toggleHyphenation: { code: "KeyH", label: "H", name: "Мин. переносов", category: "bubble" },
  toggleBold: { code: "KeyB", label: "B", name: "Жирный шрифт", category: "bubble" },
  toggleItalic: { code: "KeyI", label: "I", name: "Курсив", category: "bubble" },
  toggleUppercase: { code: "KeyU", label: "U", name: "Все заглавные", category: "bubble" },

  // Клин и инструменты
  spotWhite: { code: "KeyW", label: "W", name: "Точечный клин: Белый", category: "cleaning" },
  spotLama: { code: "KeyL", label: "L", name: "Точечный клин: LaMa", category: "cleaning" },
  spotWhiteDel: { code: "KeyW", shift: true, label: "Shift+W", name: "Белый + Удалить", category: "cleaning" },
  spotLamaDel: { code: "KeyL", shift: true, label: "Shift+L", name: "LaMa + Удалить", category: "cleaning" },
  brushSizeUp: { code: "ArrowUp", label: "↑", name: "Кисть: увеличить", category: "tools" },
  brushSizeDown: { code: "ArrowDown", label: "↓", name: "Кисть: уменьшить", category: "tools" },

  // Действия с главой
  chapterDetectAll: { code: "KeyD", alt: true, label: "Alt+D", name: "Глава: Detect & OCR", category: "chapter" },
  chapterCleanAll: { code: "KeyC", alt: true, label: "Alt+C", name: "Глава: Smart Clean", category: "chapter" },
  chapterExportAll: { code: "KeyE", alt: true, label: "Alt+E", name: "Глава: Экспорт всех страниц", category: "chapter" },
  chapterExportJson: { code: "KeyJ", alt: true, label: "Alt+J", name: "Глава: Экспорт JSON", category: "chapter" },
  chapterImportJson: { code: "KeyI", alt: true, label: "Alt+I", name: "Глава: Импорт JSON", category: "chapter" },
}

export const HOTKEYS_STORAGE_KEY = "manga_translator_hotkeys_v2"
export const HOTKEYS_UPDATED_EVENT = "hotkeys-updated"

export function matchHotkey(e: KeyboardEvent, binding: HotkeyBinding): boolean {
  const reqCtrl = Boolean(binding.ctrl)
  const reqShift = Boolean(binding.shift)
  const reqAlt = Boolean(binding.alt)

  const isCtrl = e.ctrlKey || e.metaKey
  const isShift = e.shiftKey
  const isAlt = e.altKey

  if (reqCtrl !== isCtrl || reqShift !== isShift || reqAlt !== isAlt) {
    return false
  }

  if (e.code === binding.code) return true

  if (binding.code.startsWith("Digit")) {
    const digitChar = binding.code.replace("Digit", "")
    if (e.code === `Numpad${digitChar}`) return true
  }

  if (binding.code === "Equal" && (e.code === "NumpadAdd" || e.key === "+")) return true
  if (binding.code === "Minus" && (e.code === "NumpadSubtract" || e.key === "-")) return true
  if (binding.code === "Delete" && e.code === "Backspace") return true

  return false
}

export function formatKeyEvent(e: KeyboardEvent): {
  code: string
  shift: boolean
  ctrl: boolean
  alt: boolean
  label: string
} | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
    return null
  }

  const ctrl = e.ctrlKey || e.metaKey
  const shift = e.shiftKey
  const alt = e.altKey

  let keyName = e.code
  if (keyName.startsWith("Key")) keyName = keyName.replace("Key", "")
  else if (keyName.startsWith("Digit")) keyName = keyName.replace("Digit", "")
  else if (keyName === "Equal") keyName = "+"
  else if (keyName === "Minus") keyName = "-"
  else if (keyName === "ArrowUp") keyName = "↑"
  else if (keyName === "ArrowDown") keyName = "↓"
  else if (keyName === "ArrowLeft") keyName = "←"
  else if (keyName === "ArrowRight") keyName = "→"

  const parts: string[] = []
  if (ctrl) parts.push("Ctrl")
  if (alt) parts.push("Alt")
  if (shift) parts.push("Shift")
  parts.push(keyName)

  return {
    code: e.code,
    ctrl,
    shift,
    alt,
    label: parts.join("+"),
  }
}

export function loadHotkeys(): HotkeyConfig {
  if (typeof window === "undefined") return { ...DEFAULT_HOTKEYS }
  try {
    const raw = localStorage.getItem(HOTKEYS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_HOTKEYS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_HOTKEYS, ...parsed }
  } catch {
    return { ...DEFAULT_HOTKEYS }
  }
}

export function saveHotkeys(config: HotkeyConfig) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(HOTKEYS_STORAGE_KEY, JSON.stringify(config))
    window.dispatchEvent(new Event(HOTKEYS_UPDATED_EVENT))
  } catch (err) {
    console.error("Ошибка сохранения хоткеев:", err)
  }
}
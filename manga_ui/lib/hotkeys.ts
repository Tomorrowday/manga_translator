// lib/hotkeys.ts
// ЕДИНЫЙ ЦЕНТР УПРАВЛЕНИЯ ГОРЯЧИМИ КЛАВИШАМИ

export const BUBBLE_HOTKEYS = {
  // Форма бабла: Овал / Прямоугольник (R / русская К)
  toggleShape: {
    code: "KeyR",
    label: "R",
    name: "Oval / Rect",
  },
  // Белая обводка текста (S / русская Ы)
  toggleStroke: {
    code: "KeyS",
    label: "S",
    name: "Stroke",
  },
  // Режим отступа: Fit / Safe (F / русская А)
  togglePadding: {
    code: "KeyF",
    label: "F",
    name: "Fit / Safe",
  },
  // Жирный шрифт (B / русская И)
  toggleBold: {
    code: "KeyB",
    label: "B",
    name: "Bold",
  },
  // Курсив (I / русская Ш)
  toggleItalic: {
    code: "KeyI",
    label: "I",
    name: "Italic",
  },
  // Все заглавные буквы (U / русская Г)
  toggleUppercase: {
    code: "KeyU",
    label: "U",
    name: "Uppercase",
  },
  // Поднять бабл выше по списку ([ / русская Х)
  moveOrderUp: {
    code: "BracketLeft",
    label: "[",
    name: "Move Up",
  },
  // Опустить бабл ниже по списку (] / русская Ъ)
  moveOrderDown: {
    code: "BracketRight",
    label: "]",
    name: "Move Down",
  },
} as const
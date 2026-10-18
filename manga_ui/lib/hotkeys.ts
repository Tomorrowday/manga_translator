// lib/hotkeys.ts
// ЕДИНЫЙ ЦЕНТР УПРАВЛЕНИЯ ГОРЯЧИМИ КЛАВИШАМИ

export const BUBBLE_HOTKEYS = {
  // Поднять бабл выше по списку чтения (A / русская Ф)
  moveOrderUp: {
    code: "KeyA",
    label: "A",
    name: "Move Up",
  },
  // Опустить бабл ниже по списку чтения (D / русская В)
  moveOrderDown: {
    code: "KeyD",
    label: "D",
    name: "Move Down",
  },
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
  // Минимизация переносов: Целые слова / Дефисы (H / русская Р)
  toggleHyphenation: {
    code: "KeyH",
    label: "H",
    name: "Min Hyphens",
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
  // Точечный клин: Белый (W / русская Ц)
  spotWhite: {
    code: "KeyW",
    label: "W",
    name: "Spot White",
  },
  // Точечный клин: LaMa (L / русская Д)
  spotLama: {
    code: "KeyL",
    label: "L",
    name: "Spot LaMa",
  },
  // Точечный клин: Белый + Удалить рамку (Shift + W)
  spotWhiteDel: {
    code: "KeyW",
    label: "Shift+W",
    name: "Spot White & Del",
  },
  // Точечный клин: LaMa + Удалить рамку (Shift + L)
  spotLamaDel: {
    code: "KeyL",
    label: "Shift+L",
    name: "Spot LaMa & Del",
  },
} as const
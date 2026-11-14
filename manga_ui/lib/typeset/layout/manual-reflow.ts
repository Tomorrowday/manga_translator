// manga_ui/lib/typeset/layout/manual-reflow.ts
// Сохранение ручных переносов строк, расставленных пользователем

/**
 * Вычисляет сохраняемый текст `box.rusText` после ручной правки:
 * если пользователь расставил переносы клавишей Enter, они жестко фиксируются
 */
export function reflowFromManualLines(
  previousRenderedLines: string[],
  editedText: string
): string {
  const rawEditedLines = editedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (rawEditedLines.length === 0) return ""

  // Возвращаем заданную пользователем структуру строк напрямую
  return rawEditedLines.join("\n")
}

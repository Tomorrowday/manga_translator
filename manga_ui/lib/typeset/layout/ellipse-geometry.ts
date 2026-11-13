// manga_ui/lib/typeset/layout/ellipse-geometry.ts
// Геометрия овального бабла: допустимая ширина строки на заданном вертикальном смещении

export function getEllipseWidthAtY(yOffset: number, rx: number, ry: number): number {
  if (ry <= 0 || Math.abs(yOffset) >= ry) {
    return rx * 0.58
  }
  const val = Math.max(0, 1 - (yOffset / ry) ** 2)
  return Math.max(rx * 0.58, 2 * rx * Math.sqrt(val))
}

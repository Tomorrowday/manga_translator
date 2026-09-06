// lib/typeset.ts
// Общие утилиты для нарезки баблов и запекания русского текста на скан.
// Используются пакетной обработкой главы (BatchChapterActions), логика 1-в-1
// повторяет ручной экспорт страницы в MangaTranslator.

import type { TextBlock } from "./types"

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

// Загружает картинку с CORS и ждёт полного декодирования.
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = src
    if (img.complete && img.naturalWidth > 0) {
      resolve(img)
      return
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Не удалось загрузить картинку: ${src}`))
  })
}

// Вырезает прямоугольную область (в долях 0..1) в отдельный PNG.
export function cropRegion(
  img: HTMLImageElement,
  rect: CropRect,
): Promise<{ dataUrl: string; blob: Blob | null }> {
  if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
    return Promise.resolve({ dataUrl: "", blob: null })
  }

  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(rect.width * nw))
  canvas.height = Math.max(1, Math.round(rect.height * nh))
  const ctx = canvas.getContext("2d")

  if (ctx) {
    try {
      ctx.drawImage(img, rect.x * nw, rect.y * nh, rect.width * nw, rect.height * nh, 0, 0, canvas.width, canvas.height)
    } catch {
      return Promise.resolve({ dataUrl: "", blob: null })
    }
  }

  try {
    const dataUrl = canvas.toDataURL("image/png")
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve({ dataUrl, blob }), "image/png")
    })
  } catch {
    return Promise.resolve({ dataUrl: "", blob: null })
  }
}

// Запекает русский текст всех баблов на переданную картинку и отдаёт PNG-blob
// в оригинальном разрешении (для сохранения в папку translated/).
export function bakePageBlob(img: HTMLImageElement, blocks: TextBlock[]): Promise<Blob | null> {
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.resolve(null)

  // 1. Рисуем очищенную/исходную страницу
  ctx.drawImage(img, 0, 0)

  // 2. Рисуем баблы
  for (const box of blocks) {
    if (!box.rusText || !box.rusText.trim()) continue

    const bx = box.x * canvas.width
    const by = box.y * canvas.height
    const bw = box.width * canvas.width
    const bh = box.height * canvas.height

    const displayText = box.isUppercase ? box.rusText.toUpperCase() : box.rusText
    const fontName = box.fontFamily || "v_CCFaceFront"
    const isBold = box.isBold ? "bold " : ""
    const isItalic = box.isItalic ? "italic " : ""

    const baseSize = box.fontSize || Math.max(11, Math.min(15, Math.round(11 + box.height * 22)))
    const calculatedSize = Math.round(baseSize * (canvas.height / 1200))

    ctx.font = `${isItalic}${isBold}${calculatedSize}px '${fontName}', sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    const maxWidth = bw * 0.88
    const words = displayText.split(/\s+/)
    const lines: string[] = []
    let currentLine = ""

    for (const w of words) {
      if (ctx.measureText(w).width > maxWidth) {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = ""
        }
        let part = ""
        for (const char of w) {
          if (ctx.measureText(part + char).width > maxWidth) {
            lines.push(part)
            part = char
          } else {
            part += char
          }
        }
        currentLine = part
        continue
      }

      const testLine = currentLine ? `${currentLine} ${w}` : w
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = w
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)

    const lineHeight = calculatedSize * 1.16
    const startY = by + bh / 2 - ((lines.length - 1) * lineHeight) / 2
    const centerX = bx + bw / 2

    lines.forEach((line, idx) => {
      const ly = startY + idx * lineHeight

      if (box.hasStroke) {
        ctx.strokeStyle = "#FFFFFF"
        ctx.lineWidth = Math.max(4, calculatedSize * 0.22)
        ctx.lineJoin = "round"
        ctx.strokeText(line, centerX, ly)
      }

      ctx.fillStyle = "#000000"
      ctx.fillText(line, centerX, ly)
    })
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png")
  })
}

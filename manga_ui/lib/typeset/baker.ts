// lib/typeset/baker.ts
// Рендеринг и запекание тайпсета на Canvas с поддержкой поворота

import type { TextBlock } from "../types"
import { layoutBubbleTextLines } from "./layout"

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

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

export function cropRegion(img: HTMLImageElement, rect: CropRect): Promise<{ dataUrl: string }> {
  if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
    return Promise.resolve({ dataUrl: "" })
  }

  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(rect.width * nw))
  canvas.height = Math.max(1, Math.round(rect.height * nh))
  const ctx = canvas.getContext("2d")

  if (ctx) {
    try {
      const rot = rect.rotation || 0
      if (Math.abs(rot) >= 0.5) {
        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((-rot * Math.PI) / 180)
        ctx.drawImage(
          img,
          rect.x * nw,
          rect.y * nh,
          rect.width * nw,
          rect.height * nh,
          -canvas.width / 2,
          -canvas.height / 2,
          canvas.width,
          canvas.height
        )
        ctx.restore()
      } else {
        ctx.drawImage(
          img,
          rect.x * nw,
          rect.y * nh,
          rect.width * nw,
          rect.height * nh,
          0,
          0,
          canvas.width,
          canvas.height
        )
      }
    } catch {
      return Promise.resolve({ dataUrl: "" })
    }
  }

  try {
    return Promise.resolve({ dataUrl: canvas.toDataURL("image/png") })
  } catch {
    return Promise.resolve({ dataUrl: "" })
  }
}

export async function bakePageBlob(img: HTMLImageElement, blocks: TextBlock[]): Promise<Blob | null> {
  if (typeof document !== "undefined" && document.fonts) {
    await document.fonts.ready
  }

  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  ctx.drawImage(img, 0, 0)

  for (const box of blocks) {
    const rawText = (box.rusText || "").trim()
    if (!rawText) continue

    const displayText = box.isUppercase ? rawText.toUpperCase() : rawText
    const bx = box.x * canvas.width
    const by = box.y * canvas.height
    const bw = box.width * canvas.width
    const bh = box.height * canvas.height
    const rot = box.rotation || 0
    const minHyphens = box.minHyphens !== undefined ? box.minHyphens : true

    const baseSize = box.fontSize || Math.max(11, Math.min(16, Math.round(11 + box.height * 24)))
    const currentFontSize = Math.round(baseSize * (canvas.height / 1200))
    const fontName = box.fontFamily || "v_CCFaceFront"

    const { lines, actualFontSize, lineHeight } = layoutBubbleTextLines(
      ctx,
      displayText,
      bw,
      bh,
      currentFontSize,
      fontName,
      box.shape || "rect",
      box.paddingMode || "safe",
      box.isBold,
      box.isItalic,
      minHyphens
    )

    const totalHeight = lines.length * lineHeight
    const startY = by + (bh - totalHeight) / 2 + lineHeight / 2
    const centerX = bx + bw / 2
    const centerY = by + bh / 2

    ctx.save()
    if (Math.abs(rot) >= 0.5) {
      ctx.translate(centerX, centerY)
      ctx.rotate((rot * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
    }

    const isBold = box.isBold ? "bold " : ""
    const isItalic = box.isItalic ? "italic " : ""
    ctx.font = `${isItalic}${isBold}${actualFontSize}px '${fontName}', sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    lines.forEach((line, idx) => {
      const ly = startY + idx * lineHeight

      if (box.hasStroke) {
        ctx.strokeStyle = "#FFFFFF"
        ctx.lineWidth = Math.max(3, actualFontSize * 0.18)
        ctx.lineJoin = "round"
        ctx.strokeText(line, centerX, ly)
      }

      ctx.fillStyle = "#000000"
      ctx.fillText(line, centerX, ly)
    })

    ctx.restore()
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png")
  })
}
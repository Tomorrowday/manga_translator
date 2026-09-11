// lib/typeset.ts
// Единый движок типографики: автоподгонка размера шрифта, автопереносы, японский порядок чтения и ротация

import type { TextBlock } from "./types"

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

const RUS_VOWELS = new Set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
const RUS_SIGNS = new Set("ьъйЬЪЙ")

function appendHyphenSafe(str: string): string {
  if (!str) return str
  const trimmed = str.trimEnd()
  const lastChar = trimmed[trimmed.length - 1]
  if (/[-—–.,!?:;…«»"'\)\]]/.test(lastChar)) {
    return trimmed
  }
  return trimmed + "-"
}

function cleanLeadingPunct(str: string): string {
  return str.replace(/^[-—–\s]+/, "")
}

function getWordHyphenSplits(word: string): Array<{ prefix: string; suffix: string }> {
  if (word.includes("-")) {
    const dashIdx = word.indexOf("-")
    const pfx = word.slice(0, dashIdx + 1)
    const sfx = cleanLeadingPunct(word.slice(dashIdx + 1))
    if (pfx && sfx) {
      return [{ prefix: pfx, suffix: sfx }]
    }
  }

  const match = word.match(/^([.«"(\[…\s]*)([а-яА-ЯёЁa-zA-Z]+)(.*)$/)
  if (!match) return []

  const leadPunct = match[1]
  const core = match[2]
  const trailPunct = match[3]

  if (core.length < 4) return []

  const splits: Array<{ prefix: string; suffix: string }> = []
  let vowelsBefore = 0

  for (let i = 0; i < core.length; i++) {
    if (RUS_VOWELS.has(core[i])) vowelsBefore++

    if (i < 1 || i >= core.length - 2) continue
    if (vowelsBefore === 0) continue

    const nextChar = core[i + 1]
    if (RUS_SIGNS.has(nextChar)) continue

    let vowelsAfter = 0
    for (let j = i + 1; j < core.length; j++) {
      if (RUS_VOWELS.has(core[j])) vowelsAfter++
    }
    if (vowelsAfter === 0) continue

    const prefix = appendHyphenSafe(leadPunct + core.slice(0, i + 1))
    const suffix = cleanLeadingPunct(core.slice(i + 1) + trailPunct)
    splits.push({ prefix, suffix })
  }

  return splits.reverse()
}

export function sortBlocksMangaOrder<T extends { x: number; y: number }>(blocks: T[]): T[] {
  const rowHeight = 0.18
  return [...blocks].sort((a, b) => {
    const rowA = Math.floor(a.y / rowHeight)
    const rowB = Math.floor(b.y / rowHeight)
    if (rowA !== rowB) {
      return rowA - rowB
    }
    return b.x - a.x
  })
}

export function mapDbBlockToTextBlock(b: any, cropDataUrl: string = ""): TextBlock {
  return {
    id: b.id,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    rotation: Number(b.rotation) || 0,
    japText: b.jap_text || "",
    rusText: b.rus_text || "",
    speaker: b.speaker || "",
    orderIndex: b.order_index || 0,
    fontSize: b.font_size,
    fontFamily: b.font_family || "v_CCFaceFront",
    isBold: Boolean(b.is_bold),
    isItalic: Boolean(b.is_italic),
    isUppercase: Boolean(b.is_uppercase),
    hasStroke: Boolean(b.has_stroke),
    shape: (b.shape as TextBlock["shape"]) || "rect",
    paddingMode: (b.padding_mode as TextBlock["paddingMode"]) || "safe",
    status: (b.status as TextBlock["status"]) || "new",
    imageCrop: cropDataUrl,
  }
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
        // Если бабл повернут, отрисовываем выровненный кроп
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

function getEllipseWidthAtY(yOffset: number, rx: number, ry: number): number {
  if (ry <= 0 || Math.abs(yOffset) >= ry) {
    return rx * 0.58
  }
  const val = Math.max(0, 1 - (yOffset / ry) ** 2)
  return Math.max(rx * 0.58, 2 * rx * Math.sqrt(val))
}

export function layoutBubbleTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxW: number,
  boxH: number,
  fontSize: number,
  fontFamily: string,
  shape: "rect" | "ellipse" = "rect",
  padMode: "safe" | "fit" = "safe",
  isBold?: boolean,
  isItalic?: boolean
): { lines: string[]; actualFontSize: number; lineHeight: number } {
  let curSize = fontSize
  const isEllipse = shape === "ellipse"
  const widthRatio = padMode === "fit" ? 0.98 : 0.92

  for (let attempt = 0; attempt < 30; attempt++) {
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${curSize}px '${fontFamily}', sans-serif`
    const lineHeight = Math.round(curSize * 1.15)
    const initialWords = text.trim().split(/\s+/)
    const lines: string[] = []

    if (isEllipse) {
      const rx = (boxW / 2) * widthRatio
      const ry = (boxH / 2) * widthRatio
      const totalTextW = ctx.measureText(text).width
      const estLines = Math.max(1, Math.min(25, Math.ceil(totalTextW / (boxW * 0.78))))
      const remainingWords = [...initialWords]

      while (remainingWords.length > 0 && lines.length < 35) {
        const curIdx = lines.length
        const yPos = (curIdx - (estLines - 1) / 2) * lineHeight
        const allowedW = getEllipseWidthAtY(yPos, rx, ry)

        let curLine = ""

        while (remainingWords.length > 0) {
          const w = cleanLeadingPunct(remainingWords[0])
          const testLine = curLine ? `${curLine} ${w}` : w

          if (ctx.measureText(testLine).width <= allowedW) {
            curLine = testLine
            remainingWords.shift()
            continue
          }

          let hyphenated = false
          const splits = getWordHyphenSplits(w)

          for (const split of splits) {
            const hyphenTest = curLine ? `${curLine} ${split.prefix}` : split.prefix
            if (ctx.measureText(hyphenTest).width <= allowedW) {
              curLine = hyphenTest
              remainingWords[0] = cleanLeadingPunct(split.suffix)
              hyphenated = true
              break
            }
          }

          if (hyphenated) break

          if (curLine) {
            break
          } else {
            let splitIdx = -1
            let part = ""
            for (let cIdx = 0; cIdx < w.length; cIdx++) {
              const char = w[cIdx]
              const test = appendHyphenSafe(part + char)
              if (ctx.measureText(test).width > allowedW && part.length >= 2) {
                splitIdx = cIdx
                break
              }
              part += char
            }

            if (splitIdx !== -1) {
              lines.push(appendHyphenSafe(part))
              curLine = ""
              remainingWords[0] = cleanLeadingPunct(w.slice(splitIdx))
            } else {
              lines.push(w)
              curLine = ""
              remainingWords.shift()
            }
            break
          }
        }

        if (curLine) lines.push(curLine)
      }
    } else {
      const maxW = boxW * widthRatio
      const remainingWords = [...initialWords]
      let curLine = ""

      while (remainingWords.length > 0) {
        const w = cleanLeadingPunct(remainingWords[0])
        const testLine = curLine ? `${curLine} ${w}` : w

        if (ctx.measureText(testLine).width <= maxW) {
          curLine = testLine
          remainingWords.shift()
        } else {
          let hyphenated = false
          const splits = getWordHyphenSplits(w)

          for (const split of splits) {
            const hyphenTest = curLine ? `${curLine} ${split.prefix}` : split.prefix
            if (ctx.measureText(hyphenTest).width <= maxW) {
              lines.push(hyphenTest)
              curLine = ""
              remainingWords[0] = cleanLeadingPunct(split.suffix)
              hyphenated = true
              break
            }
          }

          if (!hyphenated) {
            if (curLine) {
              lines.push(curLine)
              curLine = ""
            } else {
              let splitIdx = -1
              let part = ""
              for (let cIdx = 0; cIdx < w.length; cIdx++) {
                const char = w[cIdx]
                const test = appendHyphenSafe(part + char)
                if (ctx.measureText(test).width > maxW && part.length >= 2) {
                  splitIdx = cIdx
                  break
                }
                part += char
              }

              if (splitIdx !== -1) {
                lines.push(appendHyphenSafe(part))
                curLine = ""
                remainingWords[0] = cleanLeadingPunct(w.slice(splitIdx))
              } else {
                lines.push(w)
                curLine = ""
                remainingWords.shift()
              }
            }
          }
        }
      }
      if (curLine) lines.push(curLine)
    }

    for (let i = lines.length - 1; i > 0; i--) {
      if (/^[-—–.,!?:;…«»"'\s]+$/.test(lines[i].trim())) {
        lines[i - 1] = lines[i - 1].trimEnd() + lines[i].trim()
        lines.splice(i, 1)
      }
    }

    const targetW = isEllipse ? boxW * 0.9 : boxW * widthRatio
    const allLinesFitWidth = lines.every((line) => ctx.measureText(line).width <= targetW * 1.02)
    const totalHeight = lines.length * lineHeight
    const fitsHeight = totalHeight <= boxH * 0.95

    if ((allLinesFitWidth && fitsHeight) || curSize <= 8) {
      return { lines, actualFontSize: curSize, lineHeight }
    }

    curSize = Math.max(8, curSize - 1)
  }

  const finalLineHeight = Math.round(curSize * 1.15)
  return { lines: text.split(/\s+/), actualFontSize: curSize, lineHeight: finalLineHeight }
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
      box.isItalic
    )

    const totalHeight = lines.length * lineHeight
    const startY = by + (bh - totalHeight) / 2 + lineHeight / 2
    const centerX = bx + bw / 2
    const centerY = by + bh / 2

    // СОХРАНЯЕМ И ВРАЩАЕМ CANVAS ВОКРУГ ЦЕНТРА БАБЛА
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
// manga_ui/components/text-block-card_impl.tsx

"use client"

import React, { useState, useRef, useEffect, useMemo, memo } from "react"
import {
  ScanText,
  Trash2,
  Loader2,
  User,
  ChevronUp,
  ChevronDown,
  RotateCw,
  Eraser,
  WrapText,
} from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { runOcr } from "@/lib/api"
import { layoutBubbleTextLines, reflowFromManualLines } from "@/lib/typeset"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import { BubbleStyleControls } from "@/components/text-block-card/bubble-style-controls"
import type { TextBlockCardProps } from "./text-block-card"

const CLASS_CONFIG: Record<number, { label: string; className: string; title: string }> = {
  0: {
    label: "[1] Бабл",
    className: "border-emerald-500/60 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60",
    title: "Класс 0: Обычный бабл речи. Хоткей [C]",
  },
  1: {
    label: "[2] Мысли",
    className: "border-sky-500/60 bg-sky-950/60 text-sky-300 hover:bg-sky-900/60",
    title: "Класс 1: Мысли / Прямоугольный блок. Хоткей [V]",
  },
  2: {
    label: "[3] Текст",
    className: "border-purple-500/60 bg-purple-950/60 text-purple-300 hover:bg-purple-900/60",
    title: "Класс 2: Текст на арте (Free Text). Хоткей [G]",
  },
  3: {
    label: "[4] Звук",
    className: "border-amber-700/80 bg-amber-950/60 text-orange-400 hover:bg-amber-900/60",
    title: "Класс 3: Звуковой эффект (SFX)",
  },
}

let cardPreviewCanvas: HTMLCanvasElement | null = null

export const TextBlockCard = memo(function TextBlockCard({
  block,
  index,
  pageId,
  defaultFontSize = 14,
  autoOvalBubble = true,
  isSelected,
  onSelect,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onSpotClean,
}: TextBlockCardProps) {
  const [ocrLoading, setOcrLoading] = useState(false)
  const [spotLoading, setSpotLoading] = useState(false)
  const [isFocusedRus, setIsFocusedRus] = useState(false)
  const [localRusText, setLocalRusText] = useState(block.rusText || "")

  const cardRef = useRef<HTMLElement>(null)
  const rusTextareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshotLinesRef = useRef<string[]>([])
  const { hotkeys } = useHotkeysConfig()

  const renderedLines = useMemo(() => {
    if (typeof document === "undefined") return (block.rusText || "").split(/\r?\n/)
    if (!cardPreviewCanvas) {
      cardPreviewCanvas = document.createElement("canvas")
    }
    const ctx = cardPreviewCanvas.getContext("2d")
    const raw = (block.rusText || "").trim()
    if (!ctx || !raw) return []

    const imgEl = document.querySelector<HTMLImageElement>("img[alt='Manga page']")
    const naturalW = imgEl?.naturalWidth || 1100
    const naturalH = imgEl?.naturalHeight || 1600

    const baseSize = block.fontSize || defaultFontSize
    const masterFontSize = Math.round(baseSize * (naturalH / 1200))
    const masterBoxPixelW = block.width * naturalW
    const masterBoxPixelH = block.height * naturalH
    const currentFont = block.fontFamily || "v_CCFaceFront"

    const res = layoutBubbleTextLines(
      ctx,
      raw,
      masterBoxPixelW,
      masterBoxPixelH,
      masterFontSize,
      currentFont,
      block.shape || "rect",
      block.paddingMode || "safe",
      block.isBold,
      block.isItalic,
      block.minHyphens !== false
    )
    return res.lines
  }, [
    block.rusText,
    block.width,
    block.height,
    block.fontSize,
    block.fontFamily,
    block.shape,
    block.paddingMode,
    block.isBold,
    block.isItalic,
    block.minHyphens,
    defaultFontSize,
  ])

  useEffect(() => {
    if (!isFocusedRus) {
      const displayStr = renderedLines.length > 0 ? renderedLines.join("\n") : block.rusText || ""
      setLocalRusText(displayStr)
      snapshotLinesRef.current = [...renderedLines]
    }
  }, [renderedLines, block.rusText, isFocusedRus])

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "auto", block: "nearest" })
    }
  }, [isSelected])

  useEffect(() => {
    if (block.status === "new" && pageId && !block.japText) {
      handleOcr()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOcr = async () => {
    if (!pageId) return
    setOcrLoading(true)
    try {
      const text = await runOcr(pageId, block.x, block.y, block.width, block.height, block.rotation || 0)
      onChange({ japText: text, status: block.status === "translated" ? "translated" : "ocr-done" })
    } finally {
      setOcrLoading(false)
    }
  }

  const handleSpot = async (method: "auto" | "lama" | "white", deleteAfter = false) => {
    if (!onSpotClean) return
    setSpotLoading(true)
    try {
      await onSpotClean(method, deleteAfter)
    } finally {
      setSpotLoading(false)
    }
  }

  const currentClassId = block.class_id ?? 0
  const classCfg = CLASS_CONFIG[currentClassId] || CLASS_CONFIG[0]

  const handleCycleClass = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Цикл по всем 4-м классам: 0 (bubble), 1 (thought), 2 (text_free), 3 (sfx)
    const nextClass = (currentClassId + 1) % 4
    const hasTranslation = Boolean(block.rusText && block.rusText.trim())
    const nextShape = nextClass === 0 && autoOvalBubble && hasTranslation ? "ellipse" : "rect"
    onChange({ class_id: nextClass, shape: nextShape })
  }

  const saveStorageTextToBlock = (storageText: string) => {
    const patch: Partial<TextBlock> = {
      rusText: storageText,
      status: storageText.trim() ? "translated" : block.japText ? "ocr-done" : "new",
    }
    if (currentClassId === 0 && autoOvalBubble && !block.shape) {
      patch.shape = storageText.trim().length > 0 ? "ellipse" : "rect"
    } else if (
      currentClassId === 0 &&
      autoOvalBubble &&
      storageText.trim().length > 0 &&
      block.shape === "rect" &&
      !block.rusText
    ) {
      patch.shape = "ellipse"
    }
    onChange(patch)
  }

  const handleRusKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const ta = rusTextareaRef.current
      if (ta && cardPreviewCanvas) {
        e.preventDefault()
        const start = ta.selectionStart ?? localRusText.length
        const end = ta.selectionEnd ?? localRusText.length
        const before = localRusText.slice(0, start).trimEnd()
        const after = localRusText.slice(end).trimStart()

        const nextRaw = `${before}\n${after}`
        const storageText = reflowFromManualLines(snapshotLinesRef.current, nextRaw)

        const ctx = cardPreviewCanvas.getContext("2d")
        const imgEl = document.querySelector<HTMLImageElement>("img[alt='Manga page']")
        const naturalW = imgEl?.naturalWidth || 1100
        const naturalH = imgEl?.naturalHeight || 1600
        const baseSize = block.fontSize || defaultFontSize
        const masterFontSize = Math.round(baseSize * (naturalH / 1200))

        if (ctx) {
          const res = layoutBubbleTextLines(
            ctx,
            storageText,
            block.width * naturalW,
            block.height * naturalH,
            masterFontSize,
            block.fontFamily || "v_CCFaceFront",
            block.shape || "rect",
            block.paddingMode || "safe",
            block.isBold,
            block.isItalic,
            block.minHyphens !== false
          )
          const formattedVisible = res.lines.join("\n")
          snapshotLinesRef.current = [...res.lines]
          setLocalRusText(formattedVisible)
          saveStorageTextToBlock(storageText)

          const newCursorPos = Math.min(formattedVisible.length, before.length + 1)
          requestAnimationFrame(() => {
            if (rusTextareaRef.current) {
              rusTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
            }
          })
          return
        }
      }
    }
  }

  const handleClearManualBreaks = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!block.rusText) return
    const cleaned = block.rusText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .reduce((acc, line) => {
        if (!acc) return line
        if (acc.endsWith("-") && !acc.endsWith(" -") && !acc.endsWith("—")) {
          return acc.slice(0, -1) + line
        }
        return `${acc} ${line}`
      }, "")
      .replace(/\s+/g, " ")
    saveStorageTextToBlock(cleaned)
  }

  const isEllipse = block.shape === "ellipse"
  const hasRotation = Math.abs(block.rotation || 0) >= 0.5
  const isTranslated = block.status === "translated" || Boolean(block.rusText && block.rusText.trim())
  const hasManualNewlines = Boolean(block.rusText && /\r?\n/.test(block.rusText))
  const rusRows = Math.min(6, Math.max(1, localRusText.split(/\r?\n/).length))

  return (
    <article
      ref={cardRef}
      onClick={onSelect}
      className={[
        "cursor-pointer rounded-lg border bg-slate-800/60 p-2.5 transition-colors",
        isSelected ? "border-amber-400/80 ring-1 ring-amber-400/40" : "border-slate-700/80 hover:border-slate-600",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-indigo-300">
            {index + 1}
          </span>

          <button
            type="button"
            onClick={handleCycleClass}
            className={`rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide transition-colors ${classCfg.className}`}
            title={classCfg.title}
          >
            {classCfg.label}
          </button>

          {isTranslated && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              TR
            </span>
          )}

          {isEllipse && (
            <span className="rounded bg-indigo-950/60 px-1 py-0.5 text-[9px] text-indigo-300 border border-indigo-800/50">
              Oval
            </span>
          )}

          {hasRotation && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange({ rotation: 0 })
              }}
              className="flex items-center gap-0.5 rounded bg-amber-950/60 px-1 py-0.5 text-[9px] font-medium text-amber-300 border border-amber-800/50 hover:bg-amber-900/60 transition-colors"
              title="Сбросить угол поворота на 0°"
            >
              <RotateCw className="h-2 w-2" />
              {Math.round(block.rotation!)}°
            </button>
          )}

          <div className="relative w-28 sm:w-32">
            <User className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={block.speaker || ""}
              onChange={(e) => onChange({ speaker: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              list="manga-speakers"
              placeholder="Speaker..."
              className="h-6 w-full rounded border border-slate-700 bg-slate-950/80 pl-5 pr-1.5 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {onSpotClean && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={spotLoading}
              onClick={(e) => {
                e.stopPropagation()
                handleSpot("white", false)
              }}
              className="h-6 rounded border border-slate-700 bg-slate-900 px-1.5 text-[10px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              title={`Белый клин [${hotkeys.spotWhite.label}]`}
            >
              {spotLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin inline mr-0.5" /> : null}
              White [{hotkeys.spotWhite.label}]
            </button>

            <button
              type="button"
              disabled={spotLoading}
              onClick={(e) => {
                e.stopPropagation()
                handleSpot("lama", false)
              }}
              className="h-6 rounded bg-purple-900/60 px-1.5 text-[10px] font-medium text-purple-200 hover:bg-purple-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              title={`Стереть LaMa [${hotkeys.spotLama.label}]`}
            >
              LaMa [{hotkeys.spotLama.label}]
            </button>

            <button
              type="button"
              disabled={spotLoading}
              onClick={(e) => {
                e.stopPropagation()
                handleSpot("white", true)
              }}
              className="flex items-center gap-0.5 h-6 rounded border border-slate-700 bg-slate-850 px-1.5 text-[10px] font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              title={`Белый клин и сразу удалить [${hotkeys.spotWhiteDel.label}]`}
            >
              <Eraser className="h-2.5 w-2.5 text-slate-400" />
              W&Del
            </button>

            <button
              type="button"
              disabled={spotLoading}
              onClick={(e) => {
                e.stopPropagation()
                handleSpot("lama", true)
              }}
              className="flex items-center gap-0.5 h-6 rounded border border-rose-800/60 bg-rose-950/40 px-1.5 text-[10px] font-medium text-rose-300 hover:bg-rose-900/60 disabled:opacity-50 transition-colors whitespace-nowrap"
              title={`Стереть LaMa и сразу удалить [${hotkeys.spotLamaDel.label}]`}
            >
              <Eraser className="h-2.5 w-2.5 text-rose-400" />
              L&Del
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleOcr()
            }}
            disabled={ocrLoading || !pageId}
            className="flex h-6 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-1.5 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 transition-colors"
            title="Перераспознать OCR для этого бабла"
          >
            {ocrLoading ? <Loader2 className="h-3 w-3 animate-spin text-sky-400" /> : <ScanText className="h-3 w-3 text-sky-400" />}
            <span className="text-[10px] hidden sm:inline">OCR</span>
          </button>

          <div className="flex items-center rounded border border-slate-700 bg-slate-900 p-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMoveUp()
              }}
              disabled={!canMoveUp}
              aria-label="Move block up"
              title={`Поднять выше [${hotkeys.moveOrderUp.label}]`}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMoveDown()
              }}
              disabled={!canMoveDown}
              aria-label="Move block down"
              title={`Опустить ниже [${hotkeys.moveOrderDown.label}]`}
              className="flex h-5 w-5 items-center justify-center rounded border-l border-slate-700 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label="Delete block"
            className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-700 hover:text-red-400"
            title={`Удалить бабл (${hotkeys.deleteBlock.label})`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <div>
          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Japanese</span>
          <textarea
            value={block.japText}
            onChange={(e) => onChange({ japText: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Японский текст…"
            rows={1}
            className="w-full min-h-[30px] resize-y rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">Russian</span>
            {hasManualNewlines && (
              <button
                type="button"
                onClick={handleClearManualBreaks}
                className="flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] text-amber-300/90 hover:bg-amber-950/50 hover:text-amber-200 transition-colors"
                title="Сбросить все ручные переносы строк (вернуть полный автоперенос)"
              >
                <WrapText className="h-2.5 w-2.5" />
                <span>Авто-баланс</span>
              </button>
            )}
          </div>
          <textarea
            ref={rusTextareaRef}
            value={localRusText}
            onFocus={() => {
              setIsFocusedRus(true)
              snapshotLinesRef.current = [...renderedLines]
            }}
            onBlur={() => {
              setIsFocusedRus(false)
              if (localRusText.trim() !== snapshotLinesRef.current.join("\n").trim()) {
                const storageText = reflowFromManualLines(snapshotLinesRef.current, localRusText.trim())
                saveStorageTextToBlock(storageText)
              }
            }}
            onChange={(e) => {
              setLocalRusText(e.target.value)
            }}
            onKeyDown={handleRusKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="Перевод на русский…"
            rows={rusRows}
            className="w-full min-h-[30px] resize-y rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <BubbleStyleControls block={block} defaultFontSize={defaultFontSize} onChange={onChange} />
    </article>
  )
})
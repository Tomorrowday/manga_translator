// manga_ui/components/text-block-card.tsx
// Карточка бабла: переключение класса учитывает тоггл овала, подсказки хоткеев обновлены

"use client"

import React, { useState, useRef, useEffect, memo } from "react"
import {
  ScanText,
  Trash2,
  Loader2,
  User,
  ChevronUp,
  ChevronDown,
  RotateCw,
} from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { runOcr } from "@/lib/api"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import { BubbleStyleControls } from "@/components/text-block-card/bubble-style-controls"
import { SpotCleanControls } from "@/components/text-block-card/spot-clean-controls"

interface TextBlockCardProps {
  block: TextBlock
  index: number
  pageId?: number
  defaultFontSize?: number
  autoOvalBubble?: boolean
  isSelected: boolean
  onSelect: () => void
  onChange: (patch: Partial<TextBlock>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onSpotClean?: (method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
}

const CLASS_CONFIG: Record<number, { label: string; className: string; title: string }> = {
  0: {
    label: "Bubble",
    className: "border-emerald-500/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60",
    title: "Класс 0: Обычный бабл речи. Хоткей [C]",
  },
  1: {
    label: "Thought",
    className: "border-sky-500/50 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60",
    title: "Класс 1: Мысли / Прямоугольный блок. Хоткей [V]",
  },
  2: {
    label: "Free Text",
    className: "border-purple-500/50 bg-purple-950/40 text-purple-300 hover:bg-purple-900/60",
    title: "Класс 2: Текст/SFX на арте. Хоткей [G]",
  },
}

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
  const cardRef = useRef<HTMLElement>(null)
  const { hotkeys } = useHotkeysConfig()

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

  const currentClassId = block.class_id ?? 0
  const classCfg = CLASS_CONFIG[currentClassId] || CLASS_CONFIG[0]

  const handleCycleClass = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextClass = (currentClassId + 1) % 3
    // Овал ставится только если включен тоггл autoOvalBubble, иначе остается rect
    const nextShape = nextClass === 0 && autoOvalBubble ? "ellipse" : "rect"
    onChange({ class_id: nextClass, shape: nextShape })
  }

  const isEllipse = block.shape === "ellipse"
  const hasRotation = Math.abs(block.rotation || 0) >= 0.5
  const isTranslated = block.status === "translated" || Boolean(block.rusText && block.rusText.trim())

  return (
    <article
      ref={cardRef}
      onClick={onSelect}
      className={[
        "cursor-pointer rounded-lg border bg-slate-800/60 p-3 transition-colors",
        isSelected ? "border-amber-400/70 ring-1 ring-amber-400/30" : "border-slate-700 hover:border-slate-600",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.imageCrop || "/placeholder.svg"} alt={`Bubble ${index + 1}`} className="h-full w-full object-contain" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-indigo-300">
              {index + 1}
            </span>

            {/* Кликабельный бейдж класса объекта */}
            <button
              type="button"
              onClick={handleCycleClass}
              className={`rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide transition-colors ${classCfg.className}`}
              title={classCfg.title}
            >
              {classCfg.label}
            </button>

            {isTranslated && (
              <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/20 text-emerald-300">
                Translated
              </span>
            )}

            {isEllipse && (
              <span className="rounded bg-indigo-950/60 px-1.5 py-0.5 text-[10px] text-indigo-300 border border-indigo-800/50">
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
                className="flex items-center gap-1 rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-800/50 hover:bg-amber-900/60 transition-colors"
                title="Сбросить угол поворота на 0°"
              >
                <RotateCw className="h-2.5 w-2.5" />
                {Math.round(block.rotation!)}°
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-md border border-slate-700 bg-slate-900 p-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveUp()
                }}
                disabled={!canMoveUp}
                aria-label="Move block up"
                title={`Поднять выше [${hotkeys.moveOrderUp.label}]`}
                className="flex h-6 w-7 items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveDown()
                }}
                disabled={!canMoveDown}
                aria-label="Move block down"
                title={`Опустить ниже [${hotkeys.moveOrderDown.label}]`}
                className="flex h-6 w-7 items-center justify-center rounded border-l border-slate-700 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              aria-label="Delete block"
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-red-400"
              title={`Удалить бабл (${hotkeys.deleteBlock.label})`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Speaker</label>
          <div className="relative">
            <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={block.speaker || ""}
              onChange={(e) => onChange({ speaker: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              list="manga-speakers"
              placeholder="Character name…"
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Japanese</label>
          <textarea
            value={block.japText}
            onChange={(e) => onChange({ japText: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Japanese text…"
            rows={2}
            className="w-full resize-y rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Russian</label>
          <textarea
            value={block.rusText}
            onChange={(e) => onChange({ rusText: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Translation appears here…"
            rows={2}
            className="w-full resize-y rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <BubbleStyleControls block={block} defaultFontSize={defaultFontSize} onChange={onChange} />
      <SpotCleanControls onSpotClean={onSpotClean} />

      <div className="mt-3 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleOcr()
          }}
          disabled={ocrLoading || !pageId}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4 text-sky-400" />}
          Перераспознать OCR
        </button>
      </div>
    </article>
  )
})
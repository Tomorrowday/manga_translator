// manga_ui/components/text-block-card.tsx
// Ультракомпактная карточка с авто-овалом при появлении русского перевода

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
  Eraser,
} from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { runOcr } from "@/lib/api"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import { BubbleStyleControls } from "@/components/text-block-card/bubble-style-controls"

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
  const [spotLoading, setSpotLoading] = useState(false)
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
    const nextClass = (currentClassId + 1) % 3
    const hasTranslation = Boolean(block.rusText && block.rusText.trim())
    const nextShape = nextClass === 0 && autoOvalBubble && hasTranslation ? "ellipse" : "rect"
    onChange({ class_id: nextClass, shape: nextShape })
  }

  // Обработчик изменения русского текста: появление перевода ставит овал, удаление возвращает rect
  const handleRussianTextChange = (text: string) => {
    const patch: Partial<TextBlock> = {
      rusText: text,
      status: text.trim() ? "translated" : block.japText ? "ocr-done" : "new",
    }
    if (currentClassId === 0 && autoOvalBubble) {
      patch.shape = text.trim().length > 0 ? "ellipse" : "rect"
    }
    onChange(patch)
  }

  const isEllipse = block.shape === "ellipse"
  const hasRotation = Math.abs(block.rotation || 0) >= 0.5
  const isTranslated = block.status === "translated" || Boolean(block.rusText && block.rusText.trim())

  return (
    <article
      ref={cardRef}
      onClick={onSelect}
      className={[
        "cursor-pointer rounded-lg border bg-slate-800/60 p-2.5 transition-colors",
        isSelected ? "border-amber-400/70 ring-1 ring-amber-400/30" : "border-slate-700/80 hover:border-slate-600",
      ].join(" ")}
    >
      {/* Шапка карточки */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">

        {/* Левая секция: Бейджи и поле Speaker */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-indigo-300">
            {index + 1}
          </span>

          <button
            type="button"
            onClick={handleCycleClass}
            className={`rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide transition-colors ${classCfg.className}`}
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

        {/* Центральная секция: Spot-кнопки */}
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

        {/* Правая секция: OCR, Порядок и Удаление */}
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

      {/* Текстовые поля Japanese и Russian */}
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
          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Russian</span>
          <textarea
            value={block.rusText}
            onChange={(e) => handleRussianTextChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Перевод на русский…"
            rows={1}
            className="w-full min-h-[30px] resize-y rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Инструменты стилей и шрифтов */}
      <BubbleStyleControls block={block} defaultFontSize={defaultFontSize} onChange={onChange} />
    </article>
  )
})
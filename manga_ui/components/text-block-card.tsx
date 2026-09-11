"use client"

import { useState, useRef, useEffect } from "react"
import {
  ScanText,
  Languages,
  Trash2,
  Loader2,
  Check,
  Bold,
  Italic,
  User,
  ChevronUp,
  ChevronDown,
  Square,
  CircleDot,
  Maximize2,
  Shield,
  Sparkles,
  Eraser,
  Wand2,
  RotateCw,
} from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { runOcr, runTranslate } from "@/lib/api"
import { BUBBLE_HOTKEYS } from "@/lib/hotkeys"

interface TextBlockCardProps {
  block: TextBlock
  index: number
  pageId?: number
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

const STATUS_LABELS: Record<TextBlock["status"], { label: string; className: string }> = {
  new: { label: "New", className: "bg-slate-700 text-slate-300" },
  "ocr-done": { label: "OCR", className: "bg-sky-500/20 text-sky-300" },
  translated: { label: "Translated", className: "bg-emerald-500/20 text-emerald-300" },
}

export function TextBlockCard({
  block,
  index,
  pageId,
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
  const [translateLoading, setTranslateLoading] = useState(false)
  const [spotCleanLoading, setSpotCleanLoading] = useState(false)
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
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
      const text = await runOcr(
        pageId,
        block.x,
        block.y,
        block.width,
        block.height,
        block.rotation || 0
      )
      onChange({ japText: text, status: block.status === "translated" ? "translated" : "ocr-done" })
    } finally {
      setOcrLoading(false)
    }
  }

  const handleTranslate = async () => {
    setTranslateLoading(true)
    try {
      const text = await runTranslate(block.japText)
      onChange({ rusText: text, status: "translated" })
    } finally {
      setTranslateLoading(false)
    }
  }

  const handleDoSpotClean = async (method: "auto" | "lama" | "white", deleteAfter = false) => {
    if (!onSpotClean) return
    setSpotCleanLoading(true)
    try {
      await onSpotClean(method, deleteAfter)
    } finally {
      setSpotCleanLoading(false)
    }
  }

  const status = STATUS_LABELS[block.status]
  const isEllipse = block.shape === "ellipse"
  const isFit = block.paddingMode === "fit"
  const hasRotation = Math.abs(block.rotation || 0) >= 0.5

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
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
              {status.label}
            </span>
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
                className="flex items-center gap-1 rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-800/50 hover:bg-amber-900/60"
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
                title={`Поднять выше [${BUBBLE_HOTKEYS.moveOrderUp.label}]`}
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
                title={`Опустить ниже [${BUBBLE_HOTKEYS.moveOrderDown.label}]`}
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
              title="Удалить бабл (Del)"
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

      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-2 space-y-1.5 rounded-md border border-slate-800 bg-slate-950/40 p-1.5 text-xs"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Font:</span>
          <select
            value={block.fontFamily || "v_CCFaceFront"}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="v_CCFaceFront">v_CCFaceFront (Основной)</option>
            <option value="v_Augie">v_Augie Regular</option>
            <option value="v_Blambot Casual">v_Blambot Casual Regular</option>
            <option value="v_CCYadaYadaYadaInt">v_CCYadaYadaYadaInt Regular</option>
            <option value="v_Mighty Zeo 2.0">v_Mighty Zeo 2.0 Regular</option>
            <option value="Betina Script">Betina Script</option>
            <option value="BirchCTT">BirchCTT Normal</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center gap-1 text-slate-400">
            <button
              type="button"
              onClick={() => {
                const current = block.fontSize || Math.max(11, Math.min(16, Math.round(11 + (block.height || 0.1) * 22)))
                onChange({ fontSize: Math.max(8, current - 1) })
              }}
              className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Уменьшить шрифт [-]"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => onChange({ fontSize: undefined })}
              className={[
                "px-1.5 h-6 rounded text-[10px] font-bold transition-colors",
                !block.fontSize ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200",
              ].join(" ")}
              title="Автоматический размер шрифта"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => {
                const current = block.fontSize || Math.max(11, Math.min(16, Math.round(11 + (block.height || 0.1) * 22)))
                onChange({ fontSize: Math.min(36, current + 1) })
              }}
              className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Увеличить шрифт [+]"
            >
              A+
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange({ shape: isEllipse ? "rect" : "ellipse" })}
              className={[
                "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-medium border transition-colors",
                isEllipse
                  ? "border-indigo-500 bg-indigo-600/30 text-indigo-200"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200",
              ].join(" ")}
              title={`Форма [${BUBBLE_HOTKEYS.toggleShape.label}]: Овал / Прямоугольник`}
            >
              {isEllipse ? <CircleDot className="h-3 w-3 text-indigo-400" /> : <Square className="h-3 w-3" />}
              {isEllipse ? `Oval [${BUBBLE_HOTKEYS.toggleShape.label}]` : `Rect [${BUBBLE_HOTKEYS.toggleShape.label}]`}
            </button>

            <button
              type="button"
              onClick={() => onChange({ paddingMode: isFit ? "safe" : "fit" })}
              className={[
                "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-medium border transition-colors",
                isFit
                  ? "border-emerald-500 bg-emerald-600/30 text-emerald-200"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200",
              ].join(" ")}
              title={`Режим отступа [${BUBBLE_HOTKEYS.togglePadding.label}]: Fit (в край) / Safe (запас)`}
            >
              {isFit ? <Maximize2 className="h-3 w-3 text-emerald-400" /> : <Shield className="h-3 w-3" />}
              {isFit ? `Fit [${BUBBLE_HOTKEYS.togglePadding.label}]` : `Safe [${BUBBLE_HOTKEYS.togglePadding.label}]`}
            </button>

            <button
              type="button"
              onClick={() => onChange({ isBold: !block.isBold })}
              className={["p-1 rounded transition-colors", block.isBold ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"].join(" ")}
              title={`Жирный [${BUBBLE_HOTKEYS.toggleBold.label}]`}
            >
              <Bold className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onChange({ isItalic: !block.isItalic })}
              className={["p-1 rounded transition-colors", block.isItalic ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"].join(" ")}
              title={`Курсив [${BUBBLE_HOTKEYS.toggleItalic.label}]`}
            >
              <Italic className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onChange({ isUppercase: !block.isUppercase })}
              className={["px-1 h-6 rounded text-[11px] font-extrabold transition-colors", block.isUppercase ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"].join(" ")}
              title={`Все заглавные [${BUBBLE_HOTKEYS.toggleUppercase.label}]`}
            >
              TT
            </button>

            <button
              type="button"
              onClick={() => onChange({ hasStroke: !block.hasStroke })}
              className={[
                "px-1.5 h-6 rounded text-[10px] font-bold border transition-colors",
                block.hasStroke ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-slate-800 bg-slate-900 text-slate-400",
              ].join(" ")}
              title={`Белая обводка [${BUBBLE_HOTKEYS.toggleStroke.label}]`}
            >
              Stroke [{BUBBLE_HOTKEYS.toggleStroke.label}]
            </button>
          </div>
        </div>
      </div>

      {/* ПАНЕЛЬ ТОЧЕЧНОГО ДОКЛИНА (SPOT CLEAN) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-2 flex items-center justify-between rounded-md border border-purple-950/60 bg-purple-950/20 p-1.5 text-xs"
      >
        <span className="flex items-center gap-1 text-[11px] font-medium text-purple-300 shrink-0">
          <Sparkles className="h-3 w-3 text-purple-400" />
          Spot:
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={spotCleanLoading}
            onClick={() => handleDoSpotClean("auto")}
            className="flex items-center gap-1 rounded bg-purple-900/60 px-1.5 py-0.5 text-[10px] font-medium text-purple-200 hover:bg-purple-800 disabled:opacity-50 transition-colors"
            title="Очистить область (автоматический умный режим)"
          >
            {spotCleanLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Wand2 className="h-2.5 w-2.5" />}
            Auto
          </button>

          <button
            type="button"
            disabled={spotCleanLoading}
            onClick={() => handleDoSpotClean("white")}
            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
            title="Белый клин (выбеливание с защитой контура бабла)"
          >
            White
          </button>

          <button
            type="button"
            disabled={spotCleanLoading}
            onClick={() => handleDoSpotClean("lama")}
            className="flex items-center gap-1 rounded bg-purple-900/60 px-1.5 py-0.5 text-[10px] font-medium text-purple-200 hover:bg-purple-800 disabled:opacity-50 transition-colors"
            title="Принудительно стереть нейросетью LaMa (для звуков и сложного арта)"
          >
            LaMa
          </button>

          <button
            type="button"
            disabled={spotCleanLoading}
            onClick={() => handleDoSpotClean("lama", true)}
            className="flex items-center gap-1 rounded border border-rose-800/60 bg-rose-950/40 px-1.5 py-0.5 text-[10px] font-medium text-rose-300 hover:bg-rose-900/60 disabled:opacity-50 transition-colors"
            title="Стереть артефакт/звук нейросетью LaMa и сразу удалить временную рамку"
          >
            <Eraser className="h-2.5 w-2.5 text-rose-400" />
            Clean & Del
          </button>
        </div>
      </div>

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
          1. OCR
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            handleTranslate()
          }}
          disabled={translateLoading || !block.japText.trim()}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
        >
          {translateLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : block.status === "translated" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Languages className="h-4 w-4" />
          )}
          2. Translate
        </button>
      </div>
    </article>
  )
}
// manga_ui/components/text-block-card/block-card-header_impl.tsx
// Верхняя строка карточки бабла: класс, OCR [O], бейджи, Speaker, Spot Clean, порядок и удаление

"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ScanText,
  Trash2,
  Loader2,
  User,
  ChevronUp,
  ChevronDown,
  RotateCw,
} from "lucide-react"
import { runOcr } from "@/lib/api"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import { SpotCleanControls } from "@/components/text-block-card/spot-clean-controls"
import type { BlockCardHeaderProps } from "./block-card-header"

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
    title: "Класс 3: Звуковой эффект (SFX). Хоткей [F4]",
  },
}

export function BlockCardHeader({
  block,
  index,
  pageId,
  autoOvalBubble = true,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onSpotClean,
}: BlockCardHeaderProps) {
  const [ocrLoading, setOcrLoading] = useState(false)
  const { hotkeys } = useHotkeysConfig()

  const handleOcr = useCallback(async () => {
    if (!pageId || ocrLoading) return
    setOcrLoading(true)
    try {
      const text = await runOcr(pageId, block.x, block.y, block.width, block.height, block.rotation || 0)
      onChange({ japText: text, status: block.status === "translated" ? "translated" : "ocr-done" })
    } finally {
      setOcrLoading(false)
    }
  }, [pageId, ocrLoading, block.x, block.y, block.width, block.height, block.rotation, block.status, onChange])

  useEffect(() => {
    if (block.status === "new" && pageId && !block.japText) {
      handleOcr()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Подписка на глобальное событие хоткея одиночного OCR [O]
  useEffect(() => {
    const onHotkeyOcr = (e: Event) => {
      const custom = e as CustomEvent<{ blockId: string }>
      if (custom.detail?.blockId === block.id) {
        handleOcr()
      }
    }
    window.addEventListener("manga-ocr-selected-block", onHotkeyOcr)
    return () => window.removeEventListener("manga-ocr-selected-block", onHotkeyOcr)
  }, [block.id, handleOcr])

  const currentClassId = block.class_id ?? 0
  const classCfg = CLASS_CONFIG[currentClassId] || CLASS_CONFIG[0]
  const ocrHotkeyLabel = hotkeys.ocrBlock?.label || "O"

  const handleCycleClass = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextClass = (currentClassId + 1) % 4
    const hasTranslation = Boolean(block.rusText && block.rusText.trim())
    const nextShape = nextClass === 0 && autoOvalBubble && hasTranslation ? "ellipse" : "rect"
    onChange({ class_id: nextClass, shape: nextShape })
  }

  const isEllipse = block.shape === "ellipse"
  const hasRotation = Math.abs(block.rotation || 0) >= 0.5
  const isTranslated = block.status === "translated" || Boolean(block.rusText && block.rusText.trim())

  return (
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

        {/* Кнопка OCR перенесена в левую часть сразу после кнопки типа бабла */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleOcr()
          }}
          disabled={ocrLoading || !pageId}
          className="flex h-6 items-center gap-1 rounded border border-sky-900/70 bg-sky-950/40 px-1.5 text-[10px] font-medium text-sky-300 hover:bg-sky-900/60 hover:text-sky-100 disabled:opacity-40 transition-colors"
          title={`Распознать OCR для этого бабла [${ocrHotkeyLabel}]`}
        >
          {ocrLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
          ) : (
            <ScanText className="h-3 w-3 text-sky-400" />
          )}
          <span>OCR [{ocrHotkeyLabel}]</span>
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

        <div className="relative w-24 sm:w-28">
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

      <SpotCleanControls onSpotClean={onSpotClean} />

      <div className="flex items-center gap-1 shrink-0">
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
  )
}

// manga_ui/components/translation-toolbar_impl.tsx
// Панель действий со страницей: компактная компоновка + тумблер JP [J] (режим проверки японского текста под Rikaikun / Yomitan)

"use client"

import { useState, useEffect } from "react"
import {
  Zap,
  Wand2,
  ScanText,
  PlayCircle,
  Sparkles,
  Eye,
  EyeOff,
  RotateCcw,
  Loader2,
  ChevronDown,
  Languages,
} from "lucide-react"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import type { TranslationToolbarProps } from "./translation-toolbar"

export function TranslationToolbar({
  hasCurrentPage,
  hasBlocks,
  hasCleanScan,
  isFullAuto,
  isDetecting,
  isOcrRunning,
  isBatchTranslating,
  isCleaning,
  isRevertingClean,
  showTypeset,
  showJapOverlay,
  onFullAuto,
  onAutoDetect,
  onOcrAllBlocks,
  onTranslateAll,
  onCleanPage,
  onRevertClean,
  onToggleTypeset,
  onToggleJapOverlay,
}: TranslationToolbarProps) {
  const { hotkeys } = useHotkeysConfig()
  const [internalJapOverlay, setInternalJapOverlay] = useState(false)

  const isJapActive = showJapOverlay !== undefined ? showJapOverlay : internalJapOverlay

  useEffect(() => {
    const syncEvent = (e: Event) => {
      const custom = e as CustomEvent<{ value?: boolean }>
      if (custom.detail?.value !== undefined) {
        setInternalJapOverlay(custom.detail.value)
      }
    }
    window.addEventListener("manga-jap-check-changed", syncEvent)
    return () => window.removeEventListener("manga-jap-check-changed", syncEvent)
  }, [])

  const handleToggleJapClick = () => {
    if (onToggleJapOverlay) {
      onToggleJapOverlay()
    } else {
      window.dispatchEvent(new CustomEvent("manga-toggle-jap-check"))
    }
  }

  const isAnyActionRunning =
    isFullAuto || isDetecting || isOcrRunning || isBatchTranslating || isCleaning || isRevertingClean

  const japKeyLabel = hotkeys.toggleJapCheck?.label || "J"
  const typesetKeyLabel = hotkeys.toggleTypeset?.label || "T"

  return (
    <header className="flex flex-wrap items-center justify-between border-b border-slate-800 px-3 py-2.5 gap-2 shrink-0 bg-slate-950/40">
      <div className="flex items-center gap-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 hidden sm:block">Panel</h2>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 ml-auto">
        {/* FULL AUTO */}
        <button
          onClick={onFullAuto}
          disabled={!hasCurrentPage || isAnyActionRunning}
          className="flex items-center gap-1 rounded bg-gradient-to-r from-amber-500 to-indigo-600 px-2 py-1 text-xs font-bold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-50"
          title="Полный автоматический цикл: Detect -> Clean -> Translate -> Export"
        >
          {isFullAuto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 fill-current" />}
          Auto
        </button>

        <div className="h-3.5 w-[1px] bg-slate-800" />

        {/* 1. ПОИСК С НУЛЯ (DETECT & OCR) */}
        <button
          onClick={onAutoDetect}
          disabled={!hasCurrentPage || isDetecting || isFullAuto}
          className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
          title="1. Найти баблы с нуля через YOLO и распознать текст"
        >
          {isDetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-indigo-400" />}
          1. Detect
        </button>

        {/* ТОЛЬКО OCR ДЛЯ ТЕКУЩИХ РАМОК */}
        <button
          onClick={onOcrAllBlocks}
          disabled={!hasCurrentPage || !hasBlocks || isOcrRunning || isFullAuto}
          className="flex items-center gap-1 rounded border border-sky-950/60 bg-sky-950/30 px-2 py-1 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-900/50 hover:text-sky-100 disabled:opacity-40"
          title="Распознать MangaOCR для всех текущих рамок (сохраняет координаты и порядок!)"
        >
          {isOcrRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5 text-sky-400" />}
          OCR All
        </button>

        {/* 2. SMART CLEAN */}
        <div className="relative group/clean flex items-center">
          <div className="flex items-center">
            <button
              onClick={() => onCleanPage("auto")}
              disabled={!hasCurrentPage || !hasBlocks || isCleaning || isFullAuto}
              className={[
                "flex items-center gap-1 rounded-l bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50",
                !hasCleanScan ? "rounded-r" : "",
              ].join(" ")}
              title="2. Умный клин (клик — Auto, наведите для выбора White / LaMa)"
            >
              {isCleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-purple-400" />}
              2. Clean
              <ChevronDown className="h-2.5 w-2.5 text-slate-400 opacity-60 group-hover/clean:opacity-100 transition-opacity" />
            </button>

            {hasCleanScan && (
              <button
                onClick={onRevertClean}
                disabled={isRevertingClean || isCleaning || isFullAuto}
                className="flex items-center justify-center rounded-r border-l border-slate-700 bg-slate-800 px-1.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-rose-950/60 hover:text-rose-300 disabled:opacity-50"
                title="Откатить клин страницы (вернуться к оригиналу)"
              >
                {isRevertingClean ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
              </button>
            )}
          </div>

          {!isCleaning && !isFullAuto && hasCurrentPage && hasBlocks && (
            <div className="absolute left-0 top-full pt-1 hidden group-hover/clean:flex flex-col z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex flex-col rounded-md border border-slate-700 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md min-w-[130px] space-y-0.5">
                <button
                  type="button"
                  onClick={() => onCleanPage("auto")}
                  className="flex items-center justify-between rounded px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <span className="font-medium">Clean Auto</span>
                  <span className="text-[9px] text-purple-400 font-mono">Smart</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCleanPage("white")}
                  className="flex items-center justify-between rounded px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <span className="font-medium">Clean White</span>
                  <span className="text-[9px] text-slate-400 font-mono">White</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCleanPage("lama")}
                  className="flex items-center justify-between rounded px-2 py-1 text-left text-[11px] text-purple-300 hover:bg-purple-950/60 hover:text-purple-100 transition-colors"
                >
                  <span className="font-medium">Clean LaMa</span>
                  <span className="text-[9px] text-pink-400 font-mono">Stroke</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. TRANSLATE */}
        <button
          onClick={onTranslateAll}
          disabled={!hasCurrentPage || !hasBlocks || isBatchTranslating || isFullAuto}
          className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
          title="3. Перевести страницу"
        >
          {isBatchTranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 text-emerald-400" />}
          3. Trans
        </button>

        {/* JP CHECK TOGGLE (под Rikaikun / Yomitan) */}
        <button
          type="button"
          onClick={handleToggleJapClick}
          disabled={!hasCurrentPage}
          className={[
            "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors border disabled:opacity-50",
            isJapActive
              ? "bg-amber-500/25 border-amber-500/70 text-amber-200 shadow-sm"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
          ].join(" ")}
          title={`Показать/скрыть выделяемый японский текст рядом с баблами для Rikaikun / Yomitan [${japKeyLabel}]`}
        >
          <Languages className="h-3.5 w-3.5 text-amber-400" />
          JP [{japKeyLabel}]
        </button>

        {/* 4. TYPESET TOGGLE */}
        <button
          onClick={onToggleTypeset}
          className={[
            "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors border",
            showTypeset
              ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-300"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
          ].join(" ")}
          title={`Включить/выключить предпросмотр тайпсета на скане [${typesetKeyLabel}]`}
        >
          {showTypeset ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {showTypeset ? "ON" : "OFF"}
        </button>
      </div>
    </header>
  )
}
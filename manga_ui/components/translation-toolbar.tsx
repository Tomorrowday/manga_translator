// manga_ui/components/translation-toolbar.tsx

"use client"

import { Zap, Wand2, ScanText, PlayCircle, Sparkles, Eye, EyeOff, RotateCcw, Loader2, ChevronDown } from "lucide-react"

interface TranslationToolbarProps {
  hasCurrentPage: boolean
  hasBlocks: boolean
  hasCleanScan: boolean
  isFullAuto: boolean
  isDetecting: boolean
  isOcrRunning: boolean
  isBatchTranslating: boolean
  isCleaning: boolean
  isRevertingClean: boolean
  showTypeset: boolean
  onFullAuto: () => void
  onAutoDetect: () => void
  onOcrAllBlocks: () => void
  onTranslateAll: () => void
  onCleanPage: (mode?: "auto" | "lama" | "white") => void
  onRevertClean: () => void
  onToggleTypeset: () => void
}

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
  onFullAuto,
  onAutoDetect,
  onOcrAllBlocks,
  onTranslateAll,
  onCleanPage,
  onRevertClean,
  onToggleTypeset,
}: TranslationToolbarProps) {
  const isAnyActionRunning =
    isFullAuto || isDetecting || isOcrRunning || isBatchTranslating || isCleaning || isRevertingClean

  return (
    <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Translation Panel</h2>
        <p className="text-xs text-slate-500">Detected text blocks</p>
      </div>

      <div className="flex items-center gap-1.5">
        {/* FULL AUTO */}
        <button
          onClick={onFullAuto}
          disabled={!hasCurrentPage || isAnyActionRunning}
          className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-amber-500 to-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-50"
          title="Полный автоматический цикл: Detect -> Clean -> Translate -> Export"
        >
          {isFullAuto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 fill-current" />}
          Full Auto
        </button>

        <div className="h-4 w-[1px] bg-slate-800" />

        {/* 1. ПОИСК С НУЛЯ (DETECT & OCR) */}
        <button
          onClick={onAutoDetect}
          disabled={!hasCurrentPage || isDetecting || isFullAuto}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
          title="1. Найти баблы с нуля через YOLO и распознать текст"
        >
          {isDetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-indigo-400" />}
          1. Detect & OCR
        </button>

        {/* ТОЛЬКО OCR ДЛЯ ТЕКУЩИХ РАМОК */}
        <button
          onClick={onOcrAllBlocks}
          disabled={!hasCurrentPage || !hasBlocks || isOcrRunning || isFullAuto}
          className="flex items-center gap-1.5 rounded-md border border-sky-950/60 bg-sky-950/30 px-2 py-1.5 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-900/50 hover:text-sky-100 disabled:opacity-40"
          title="Распознать MangaOCR для всех текущих рамок (сохраняет координаты и порядок!)"
        >
          {isOcrRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5 text-sky-400" />}
          OCR All
        </button>

        {/* 2. SMART CLEAN С ВЫПАДАЮЩИМИ РЕЖИМАМИ ПРИ НАВЕДЕНИИ */}
        <div className="relative group/clean flex items-center">
          <div className="flex items-center">
            <button
              onClick={() => onCleanPage("auto")}
              disabled={!hasCurrentPage || !hasBlocks || isCleaning || isFullAuto}
              className={[
                "flex items-center gap-1.5 rounded-l-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50",
                !hasCleanScan ? "rounded-r-md" : "",
              ].join(" ")}
              title="2. Умный клин (клик — Auto, наведите для выбора White / LaMa)"
            >
              {isCleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-purple-400" />}
              2. Clean
              <ChevronDown className="h-3 w-3 text-slate-400 opacity-60 group-hover/clean:opacity-100 transition-opacity" />
            </button>

            {hasCleanScan && (
              <button
                onClick={onRevertClean}
                disabled={isRevertingClean || isCleaning || isFullAuto}
                className="flex items-center justify-center rounded-r-md border-l border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-rose-950/60 hover:text-rose-300 disabled:opacity-50"
                title="Откатить клин страницы (удалить заклиненный файл и вернуться к оригиналу)"
              >
                {isRevertingClean ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Всплывающее меню режимов клина */}
          {!isCleaning && !isFullAuto && hasCurrentPage && hasBlocks && (
            <div className="absolute left-0 top-full pt-1.5 hidden group-hover/clean:flex flex-col z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex flex-col rounded-md border border-slate-700 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md min-w-[140px] space-y-0.5">
                <button
                  type="button"
                  onClick={() => onCleanPage("auto")}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <span className="font-medium">Clean Auto</span>
                  <span className="text-[9px] text-purple-400 font-mono">Smart</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCleanPage("white")}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <span className="font-medium">Clean White</span>
                  <span className="text-[9px] text-slate-400 font-mono">White</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCleanPage("lama")}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left text-[11px] text-purple-300 hover:bg-purple-950/60 hover:text-purple-100 transition-colors"
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
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
          title="3. Перевести страницу с учетом синопсиса и глоссария"
        >
          {isBatchTranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 text-emerald-400" />}
          3. Translate
        </button>

        {/* 4. TYPESET TOGGLE */}
        <button
          onClick={onToggleTypeset}
          className={[
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors border",
            showTypeset
              ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-300"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
          ].join(" ")}
          title="Включить/выключить предпросмотр тайпсета на скане"
        >
          {showTypeset ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {showTypeset ? "Typeset ON" : "OFF"}
        </button>
      </div>
    </header>
  )
}
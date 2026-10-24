// manga_ui/components/translator-header.tsx
// Шапка редактора с кнопкой вызова Настроек и Хоткеев

"use client"

import {
  BookText,
  FolderOpen,
  Loader2,
  Check,
  Download,
  Save,
  Layers,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Sliders,
} from "lucide-react"
import type { PageItem } from "@/lib/types"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"

interface TranslatorHeaderProps {
  currentPage: PageItem | null
  currentIndex?: number
  totalPages?: number
  totalBlocks: number
  translatedCount: number
  isSaving: boolean
  isExporting: boolean
  isExportSuccess: boolean
  onOpenFolder: () => void
  onExportPage: () => void
  onSaveBlocks: () => void
  onPrevPage?: () => void
  onNextPage?: () => void
  onOpenHotkeys?: () => void
  onOpenSettings?: () => void
}

export function TranslatorHeader({
  currentPage,
  currentIndex = -1,
  totalPages = 0,
  totalBlocks,
  translatedCount,
  isSaving,
  isExporting,
  isExportSuccess,
  onOpenFolder,
  onExportPage,
  onSaveBlocks,
  onPrevPage,
  onNextPage,
  onOpenHotkeys,
  onOpenSettings,
}: TranslatorHeaderProps) {
  const { hotkeys } = useHotkeysConfig()
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < totalPages - 1

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 shadow-md">
          <BookText className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight text-white">Manga Translator</h1>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {currentPage ? (
              <>
                <span className="font-semibold text-slate-200">
                  Page {currentPage.page_number}
                  {totalPages > 0 && <span className="text-slate-500 font-normal"> / {totalPages}</span>}
                </span>

                <div className="flex items-center rounded border border-slate-800 bg-slate-900 p-0.5">
                  <button
                    onClick={onPrevPage}
                    disabled={!hasPrev}
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    title={`Предыдущая страница (${hotkeys.prevPage.label})`}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={onNextPage}
                    disabled={!hasNext}
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    title={`Следующая страница (${hotkeys.nextPage.label})`}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  DB ID: {currentPage.id}
                </span>
              </>
            ) : (
              "No page selected"
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title="Глобальные настройки тайтла (тогглы, модели, шрифты)"
        >
          <Sliders className="h-3.5 w-3.5 text-amber-400" />
          Настройки
        </button>

        <button
          onClick={onOpenHotkeys}
          className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title="Настройка горячих клавиш"
        >
          <Keyboard className="h-3.5 w-3.5 text-indigo-400" />
          Хоткеи
        </button>

        {currentPage && (
          <>
            <button
              onClick={onOpenFolder}
              className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              title="Открыть готовую папку в Explorer"
            >
              <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
              Folder
            </button>

            <button
              onClick={onExportPage}
              disabled={isExporting || totalBlocks === 0}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-all shadow-sm",
                isExportSuccess
                  ? "bg-emerald-500 ring-2 ring-emerald-300"
                  : "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50",
              ].join(" ")}
              title="Запечь страницу на сервере в папку translated"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isExportSuccess ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isExportSuccess ? "Saved to folder!" : "Export Page"}
            </button>

            <button
              onClick={onSaveBlocks}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
              title={`Save (${hotkeys.savePage.label})`}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </>
        )}

        <span className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-slate-500" />
          {totalBlocks} blocks
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          {translatedCount} translated
        </span>
      </div>
    </header>
  )
}
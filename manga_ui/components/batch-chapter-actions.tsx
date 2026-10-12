"use client"

import { useState, useRef } from "react"
import { Wand2, Languages, Sparkles, Download, Loader2, Layers3, Check, FileDown, FileUp } from "lucide-react"
import type { PageItem, PageStatus, TextBlock } from "@/lib/types"
import {
  runPageAutoDetect,
  runCleanPage,
  saveTranslatedPage,
  runTranslateChapter,
  getPageDetails,
  getPageCleanImageUrl,
  getPageImageUrl,
  getPageBlocks,
  exportChapterScriptToFolder,
  uploadChapterScript,
  pickAndImportChapterScript,
} from "@/lib/api"
import { loadImage, bakePageBlob, mapDbBlockToTextBlock } from "@/lib/typeset"

interface BatchChapterActionsProps {
  pages: PageItem[]
  currentPageId: number | null
  titleDefaultFontSize?: number
  onSaveCurrentPage?: () => Promise<void>
  onPageStatusUpdate?: (pageId: number, status: PageStatus, cleanPath?: string) => void
  onRefreshCurrent: () => void
  onCompleteBatch?: () => void
}

type BatchAction = "detect" | "clean" | "translate" | "export" | "script-export" | "script-import"

interface Progress {
  action: BatchAction
  done: number
  total: number
  label: string
}

const ACTION_LABELS: Record<BatchAction, string> = {
  detect: "Detecting & OCR",
  clean: "Smart Cleaning & Retouching (AI)",
  translate: "Translating chapter with Gemini",
  export: "Exporting pages",
  "script-export": "Exporting JSON script to folder...",
  "script-import": "Importing JSON script...",
}

export function BatchChapterActions({
  pages,
  currentPageId,
  titleDefaultFontSize = 14,
  onSaveCurrentPage,
  onPageStatusUpdate,
  onRefreshCurrent,
  onCompleteBatch,
}: BatchChapterActionsProps) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [justFinished, setJustFinished] = useState<BatchAction | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isRunning = progress !== null
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const chapterId = pages[0]?.chapter_id

  const runBatch = async (action: BatchAction, worker: (page: PageItem, index: number) => Promise<void>) => {
    if (pages.length === 0 || isRunning) return
    setJustFinished(null)
    setProgress({ action, done: 0, total: pages.length, label: ACTION_LABELS[action] })

    try {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        setProgress({ action, done: i, total: pages.length, label: `${ACTION_LABELS[action]} · p.${page.page_number}` })
        try {
          await worker(page, i)
        } catch (e) {
          console.error(`Пакетная ошибка (${action}) на странице ${page.id}:`, e)
        }
      }
      setProgress({ action, done: pages.length, total: pages.length, label: "Done" })
      setJustFinished(action)
      setTimeout(() => setJustFinished(null), 2500)
    } finally {
      setProgress(null)
      onCompleteBatch?.()
      onRefreshCurrent()
    }
  }

  const detectAll = () =>
    runBatch("detect", async (page) => {
      if (page.status !== "raw" && page.status !== "new") {
        return
      }
      const res = await runPageAutoDetect(page.id)
      if (res.success && res.boxes && res.boxes.length > 0) {
        onPageStatusUpdate?.(page.id, "detected")
      }
    })

  const cleanChapter = () =>
    runBatch("clean", async (page) => {
      const res = await runCleanPage(page.id)
      if (res.success) {
        onPageStatusUpdate?.(page.id, res.page_status || "cleaned", res.clean_path)
      }
    })

  const translateChapter = async () => {
    if (!chapterId || isRunning) return

    setJustFinished(null)
    setProgress({
      action: "translate",
      done: 0,
      total: 1,
      label: "Translating entire chapter via Gemini...",
    })

    try {
      await runTranslateChapter(chapterId)
      pages.forEach((p) => {
        if (p.status !== "done") {
          onPageStatusUpdate?.(p.id, "translated")
        }
      })
      setProgress({
        action: "translate",
        done: 1,
        total: 1,
        label: "Chapter translated!",
      })
      setJustFinished("translate")
      setTimeout(() => setJustFinished(null), 2500)
    } catch (e) {
      console.error("Ошибка перевода главы:", e)
      alert("Ошибка перевода главы: " + String(e))
    } finally {
      setProgress(null)
      onCompleteBatch?.()
      onRefreshCurrent()
    }
  }

  const exportAll = async () => {
    if (pages.length === 0 || isRunning) return

    if (onSaveCurrentPage) {
      try {
        await onSaveCurrentPage()
      } catch (err) {
        console.warn("Не удалось сохранить текущую страницу перед Export All:", err)
      }
    }

    runBatch("export", async (page) => {
      const fresh = (await getPageDetails(page.id)) || page
      const baseImgUrl = fresh.clean_path
        ? `${getPageCleanImageUrl(page.id)}?t=${Date.now()}`
        : getPageImageUrl(page.id)

      const dbBlocks = await getPageBlocks(page.id)
      const blocks: TextBlock[] = dbBlocks.map((b: any) => mapDbBlockToTextBlock(b))

      const baseImg = await loadImage(baseImgUrl)
      const blob = await bakePageBlob(baseImg, blocks, titleDefaultFontSize)

      if (blob) {
        const res = await saveTranslatedPage(page.id, blob)
        if (res.success) {
          onPageStatusUpdate?.(page.id, "done")
        }
      }
    })
  }

  const handleExportScript = async () => {
    if (!chapterId) return
    setProgress({ action: "script-export", done: 0, total: 1, label: "Saving JSON to chapter folder..." })
    try {
      const res = await exportChapterScriptToFolder(chapterId)
      setJustFinished("script-export")
      setTimeout(() => setJustFinished(null), 2500)
      alert(`Скрипт главы успешно сохранён в папку:\n${res.saved_path}`)
    } catch (e) {
      alert("Ошибка сохранения скрипта: " + String(e))
    } finally {
      setProgress(null)
    }
  }

  // Импорт JSON: открывает нативный диалог в папке текущей главы, либо fallback
  const handleImportClick = async () => {
    if (!chapterId || isRunning) return

    setProgress({ action: "script-import", done: 0, total: 1, label: "Opening chapter folder..." })
    try {
      const res = await pickAndImportChapterScript(chapterId)

      if (res.cancelled) {
        setProgress(null)
        return
      }

      if (res.success) {
        pages.forEach((p) => {
          if (p.status !== "done") {
            onPageStatusUpdate?.(p.id, "translated")
          }
        })

        const msg = [
          `Файл: ${res.file_path}`,
          `Успешно импортировано реплик: ${res.updated_count}`,
          res.updated_speakers_count ? `Распознано спикеров: ${res.updated_speakers_count}` : null,
        ]
          .filter(Boolean)
          .join("\n")

        alert(msg)
        setJustFinished("script-import")
        setTimeout(() => setJustFinished(null), 2000)
        onCompleteBatch?.()
        onRefreshCurrent()
      } else {
        // Если GUI диалог на бэкенде недоступен, открываем стандартный file input браузера
        fileInputRef.current?.click()
      }
    } catch (err) {
      console.warn("Диалог бэкенда не сработал, открываем браузерный выбор файла:", err)
      fileInputRef.current?.click()
    } finally {
      setProgress(null)
    }
  }

  const handleImportScriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !chapterId) return

    setProgress({ action: "script-import", done: 0, total: 1, label: "Importing translations & speakers..." })
    try {
      const res = await uploadChapterScript(chapterId, file)
      pages.forEach((p) => {
        if (p.status !== "done") {
          onPageStatusUpdate?.(p.id, "translated")
        }
      })

      const msg = [
        `Успешно импортировано реплик: ${res.updated_count}`,
        res.updated_speakers_count ? `Распознано спикеров: ${res.updated_speakers_count}` : null,
      ]
        .filter(Boolean)
        .join("\n")

      alert(msg)
      setJustFinished("script-import")
      setTimeout(() => setJustFinished(null), 2000)
    } catch (err) {
      alert("Ошибка импорта: " + String(err))
    } finally {
      setProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      onCompleteBatch?.()
      onRefreshCurrent()
    }
  }

  const buttons: Array<{ key: BatchAction; label: string; icon: typeof Wand2; onClick: () => void; accent: string }> = [
    { key: "detect", label: "Detect & OCR All", icon: Wand2, onClick: detectAll, accent: "text-indigo-400" },
    { key: "clean", label: "Smart Clean Chapter", icon: Sparkles, onClick: cleanChapter, accent: "text-purple-400" },
    { key: "translate", label: "Translate Chapter", icon: Languages, onClick: translateChapter, accent: "text-emerald-400" },
    { key: "export", label: "Export All", icon: Download, onClick: exportAll, accent: "text-amber-400" },
  ]

  const disabled = pages.length === 0

  return (
    <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/40 px-6 py-2">
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Layers3 className="h-4 w-4 text-indigo-400" />
        <span className="hidden sm:inline">Batch Chapter</span>
        <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          {pages.length}p
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {buttons.map(({ key, label, icon: Icon, onClick, accent }) => {
          const active = progress?.action === key
          const done = justFinished === key
          return (
            <button
              key={key}
              onClick={onClick}
              disabled={disabled || isRunning}
              title={disabled ? "Open a chapter from the explorer first" : label}
              className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : done ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Icon className={`h-3.5 w-3.5 ${accent}`} />
              )}
              {label}
            </button>
          )
        })}

        <div className="mx-1 h-4 w-[1px] bg-slate-800 hidden sm:block" />

        <button
          onClick={handleExportScript}
          disabled={disabled || isRunning}
          className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
          title="Сохранить JSON скрипт главы в локальную папку главы на диске"
        >
          {justFinished === "script-export" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <FileDown className="h-3.5 w-3.5 text-sky-400" />
          )}
          Export JSON
        </button>

        <button
          onClick={handleImportClick}
          disabled={disabled || isRunning}
          className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
          title="Выбрать и импортировать JSON из папки текущей главы"
        >
          {progress?.action === "script-import" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : justFinished === "script-import" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <FileUp className="h-3.5 w-3.5 text-amber-400" />
          )}
          Import JSON
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.txt"
          onChange={handleImportScriptFile}
          className="hidden"
        />
      </div>

      <div className="ml-auto flex min-w-0 flex-1 items-center gap-3 sm:max-w-xs">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={[
              "h-full rounded-full transition-all duration-300",
              isRunning ? "bg-indigo-500" : justFinished ? "bg-emerald-500" : "bg-transparent",
            ].join(" ")}
            style={{ width: isRunning ? `${percent}%` : justFinished ? "100%" : "0%" }}
          />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
          {isRunning ? progress?.label : justFinished ? "Done" : "Idle"}
        </span>
      </div>
    </div>
  )
}
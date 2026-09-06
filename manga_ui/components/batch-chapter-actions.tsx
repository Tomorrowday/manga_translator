"use client"

import { useState } from "react"
import { Wand2, Languages, Eraser, Download, Loader2, Layers3, Check } from "lucide-react"
import type { PageItem } from "@/lib/types"
import {
  runPageAutoDetect,
  getPageBlocks,
  savePageBlocks,
  runOcr,
  runBatchTranslate,
  runCleanPage,
  getPageImageUrl,
  getPageCleanImageUrl,
  saveTranslatedPage,
} from "@/lib/api"
import { loadImage, cropRegion, bakePageBlob } from "@/lib/typeset"

interface BatchChapterActionsProps {
  pages: PageItem[]
  currentPageId: number | null
  onRefreshCurrent: () => void
}

type BatchAction = "detect" | "translate" | "clean" | "export"

interface Progress {
  action: BatchAction
  done: number
  total: number
  label: string
}

const ACTION_LABELS: Record<BatchAction, string> = {
  detect: "Detecting bubbles",
  translate: "Translating chapter",
  clean: "Cleaning pages",
  export: "Exporting pages",
}

export function BatchChapterActions({ pages, currentPageId, onRefreshCurrent }: BatchChapterActionsProps) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [justFinished, setJustFinished] = useState<BatchAction | null>(null)

  const isRunning = progress !== null
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  // Оборачивает пакетный цикл: показывает прогресс, обновляет открытую страницу в конце
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
      // Перечитываем открытую страницу, чтобы показать свежие блоки/картинку
      if (currentPageId != null) onRefreshCurrent()
    }
  }

  // 1. Детект баблов на всех страницах главы (YOLO на сервере) + запись в БД
  const detectAll = () =>
    runBatch("detect", async (page) => {
      const boxes = await runPageAutoDetect(page.id)
      if (!boxes || boxes.length === 0) return
      const payload = boxes.map((b) => ({
        id: crypto.randomUUID(),
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        jap_text: "",
        rus_text: "",
        status: "new",
      }))
      await savePageBlocks(page.id, payload)
    })

  // 2. OCR недостающего японского + связный перевод всей главы через Gemini
  const translateChapter = () =>
    runBatch("translate", async (page) => {
      const dbBlocks = await getPageBlocks(page.id)
      if (!dbBlocks || dbBlocks.length === 0) return

      const img = await loadImage(getPageImageUrl(page.id))

      // OCR для блоков без японского текста
      const withJap: Array<{ b: (typeof dbBlocks)[number]; jap: string }> = []
      for (const b of dbBlocks) {
        let jap = b.jap_text || ""
        if (!jap.trim()) {
          const { blob } = await cropRegion(img, b)
          if (blob) jap = await runOcr(blob)
        }
        withJap.push({ b, jap })
      }

      // Пакетный перевод japText -> rusText
      const items = withJap.filter((it) => it.jap.trim().length > 0).map((it) => ({ id: it.b.id, text: it.jap }))
      const translations = items.length > 0 ? await runBatchTranslate(items) : {}

      const updated = withJap.map(({ b, jap }) => {
        const rus = translations[b.id] || b.rus_text || ""
        return {
          id: b.id,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          jap_text: jap,
          rus_text: rus,
          status: rus.trim() ? "translated" : jap.trim() ? "ocr-done" : "new",
        }
      })
      await savePageBlocks(page.id, updated)
    })

  // 3. Очистка (клин) баблов на всех страницах главы через OpenCV
  const cleanChapter = () =>
    runBatch("clean", async (page) => {
      await runCleanPage(page.id)
    })

  // 4. Запекание русского текста и сохранение готовых страниц в папку translated/
  const exportAll = () =>
    runBatch("export", async (page) => {
      const dbBlocks = await getPageBlocks(page.id)
      if (!dbBlocks || dbBlocks.length === 0) return

      // Предпочитаем очищенную картинку, при её отсутствии берём оригинал
      let img: HTMLImageElement
      try {
        img = await loadImage(`${getPageCleanImageUrl(page.id)}?t=${Date.now()}`)
      } catch {
        img = await loadImage(getPageImageUrl(page.id))
      }

      const blocks = dbBlocks.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        japText: b.jap_text || "",
        rusText: b.rus_text || "",
        status: (b.status as PageItem["status"]) || "new",
      })) as any

      const blob = await bakePageBlob(img, blocks)
      if (blob) await saveTranslatedPage(page.id, blob)
    })

  const buttons: Array<{ key: BatchAction; label: string; icon: typeof Wand2; onClick: () => void; accent: string }> = [
    { key: "detect", label: "Detect All", icon: Wand2, onClick: detectAll, accent: "text-indigo-400" },
    { key: "translate", label: "Translate Chapter", icon: Languages, onClick: translateChapter, accent: "text-emerald-400" },
    { key: "clean", label: "Clean Chapter", icon: Eraser, onClick: cleanChapter, accent: "text-sky-400" },
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
      </div>

      {/* Прогресс-бар */}
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
          {isRunning ? `${progress?.label} ${progress?.done}/${progress?.total}` : justFinished ? "Done" : "Idle"}
        </span>
      </div>
    </div>
  )
}

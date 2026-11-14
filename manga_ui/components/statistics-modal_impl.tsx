// manga_ui/components/statistics-modal_impl.tsx
// Оркестратор окна статистики: загрузка данных, состояние аккордеонов, шапка и портал.
// Сводка и карточки тайтлов вынесены в components/statistics-modal/.

"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { BarChart3, X, Loader2, RefreshCw } from "lucide-react"
import {
  getAllDetailedStats,
  recalculateChapterStats,
  recalculateTitleStats,
  type TitleDetailedItem,
} from "@/lib/api"
import { StatsSummaryBar } from "@/components/statistics-modal/stats-summary-bar"
import { TitleStatsAccordion } from "@/components/statistics-modal/title-stats-accordion"
import type { StatisticsModalProps } from "./statistics-modal"

export function StatisticsModal({ onClose, currentChapterId }: StatisticsModalProps) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<TitleDetailedItem[]>([])
  const [expandedTitles, setExpandedTitles] = useState<Record<number, boolean>>({})
  const [recalculatingChapterId, setRecalculatingChapterId] = useState<number | null>(null)
  const [recalculatingTitleId, setRecalculatingTitleId] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [onClose])

  const loadData = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const res = await getAllDetailedStats()
        if (res.success && res.projects) {
          setProjects(res.projects)

          // Раскрываем тайтл текущей главы ТОЛЬКО при самом первом открытии окна
          if (isInitial) {
            const exp: Record<number, boolean> = {}
            for (const p of res.projects) {
              const hasCurrent = p.chapters.some((c) => c.id === currentChapterId)
              exp[p.id] = Boolean(hasCurrent || res.projects.length === 1)
            }
            setExpandedTitles(exp)
          }
        }
      } catch (e) {
        console.error("Ошибка загрузки статистики:", e)
      } finally {
        if (isInitial) setLoading(false)
      }
    },
    [currentChapterId]
  )

  useEffect(() => {
    loadData(true)
  }, [loadData])

  const toggleTitleExpand = (titleId: number) => {
    setExpandedTitles((prev) => ({ ...prev, [titleId]: !prev[titleId] }))
  }

  const handleRecalculateChapter = async (chapterId: number) => {
    setRecalculatingChapterId(chapterId)
    try {
      const res = await recalculateChapterStats(chapterId)
      if (res.success) {
        setProjects((prev) =>
          prev.map((p) => {
            let sumRep = 0
            let sumWords = 0
            const updatedChs = p.chapters.map((ch) => {
              if (ch.id === chapterId) {
                const updated = {
                  ...ch,
                  replicas_count: res.replicas_count,
                  words_count: res.words_count,
                }
                sumRep += updated.replicas_count || 0
                sumWords += updated.words_count || 0
                return updated
              }
              sumRep += ch.replicas_count || 0
              sumWords += ch.words_count || 0
              return ch
            })
            return {
              ...p,
              total_replicas: sumRep,
              total_words: sumWords,
              chapters: updatedChs,
            }
          })
        )
      }
    } catch (e) {
      alert("Ошибка пересчёта главы: " + String(e))
    } finally {
      setRecalculatingChapterId(null)
    }
  }

  const handleRecalculateTitle = async (titleId: number) => {
    setRecalculatingTitleId(titleId)
    try {
      const res = await recalculateTitleStats(titleId)
      if (res.success) {
        // Обновляем цифры без сброса и изменения раскрытых тайтлов
        await loadData(false)
      }
    } catch (e) {
      alert("Ошибка пересчёта тайтла: " + String(e))
    } finally {
      setRecalculatingTitleId(null)
    }
  }

  if (!mounted) return null

  // Общие суммарные показатели по всей базе данных
  const totalAllPages = projects.reduce((acc, p) => acc + p.total_pages, 0)
  const totalAllReplicas = projects.reduce((acc, p) => acc + p.total_replicas, 0)
  const totalAllWords = projects.reduce((acc, p) => acc + p.total_words, 0)
  const totalAllTime = projects.reduce((acc, p) => acc + p.total_seconds, 0)

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="flex h-[720px] w-full max-w-5xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Статистика проектов и глав</h3>
              <p className="text-xs text-slate-400">
                Количество страниц, переведённых реплик, русских слов и учтённое рабочее время
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(false)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              title="Обновить данные"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
              Обновить
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Закрыть (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <StatsSummaryBar
          totalPages={totalAllPages}
          totalReplicas={totalAllReplicas}
          totalWords={totalAllWords}
          totalSeconds={totalAllTime}
        />

        {/* Список проектов и аккордеоны глав */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
          {loading && projects.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
              <p className="text-sm">Загрузка статистики...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center text-sm text-slate-500">
              В базе пока нет проектов. Добавьте первый проект через боковую панель.
            </div>
          ) : (
            projects.map((project) => (
              <TitleStatsAccordion
                key={project.id}
                project={project}
                isExpanded={!!expandedTitles[project.id]}
                currentChapterId={currentChapterId}
                recalculatingChapterId={recalculatingChapterId}
                recalculatingTitleId={recalculatingTitleId}
                onToggle={toggleTitleExpand}
                onRecalculateTitle={handleRecalculateTitle}
                onRecalculateChapter={handleRecalculateChapter}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

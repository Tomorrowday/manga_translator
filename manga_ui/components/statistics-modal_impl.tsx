// manga_ui/components/statistics-modal_impl.tsx
// Реализация диалогового окна детальной статистики тайтлов и глав с пересчётом слов/реплик и затраченным временем

"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  BarChart3,
  X,
  Loader2,
  RefreshCw,
  Clock,
  FileText,
  MessageSquare,
  BookOpen,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import {
  getAllDetailedStats,
  recalculateChapterStats,
  recalculateTitleStats,
  type TitleDetailedItem,
} from "@/lib/api"
import type { StatisticsModalProps } from "./statistics-modal"

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "0м 00с"
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}ч ${minutes.toString().padStart(2, "0")}м ${seconds.toString().padStart(2, "0")}с`
  }
  return `${minutes}м ${seconds.toString().padStart(2, "0")}с`
}

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

        {/* Верхняя сводная карточка всей БД */}
        <div className="grid grid-cols-4 gap-3 border-b border-slate-800/80 bg-slate-950/40 p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <BookOpen className="h-4 w-4 text-indigo-400" />
              Всего страниц
            </div>
            <div className="mt-1.5 text-xl font-bold text-white font-mono">{totalAllPages}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <MessageSquare className="h-4 w-4 text-emerald-400" />
              Переведено реплик
            </div>
            <div className="mt-1.5 text-xl font-bold text-emerald-400 font-mono">{totalAllReplicas}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <FileText className="h-4 w-4 text-amber-400" />
              Слов (русских)
            </div>
            <div className="mt-1.5 text-xl font-bold text-amber-300 font-mono">{totalAllWords.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <Clock className="h-4 w-4 text-sky-400" />
              Затрачено времени
            </div>
            <div className="mt-1.5 text-xl font-bold text-sky-300 font-mono">{formatDuration(totalAllTime)}</div>
          </div>
        </div>

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
            projects.map((project) => {
              const isExpanded = !!expandedTitles[project.id]
              const isRecalculatingThisTitle = recalculatingTitleId === project.id

              return (
                <div key={project.id} className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
                  {/* Заголовок тайтла */}
                  <div
                    onClick={() => toggleTitleExpand(project.id)}
                    className="flex cursor-pointer items-center justify-between border-b border-slate-800/60 bg-slate-900/50 px-4 py-3 hover:bg-slate-900 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div>
                        <div className="text-sm font-semibold text-white">{project.name}</div>
                        <div className="text-xs text-slate-400">
                          {project.chapters.length} глав • {project.total_pages} страниц
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-xs font-mono">
                      <div className="text-right">
                        <span className="text-slate-500 mr-1.5 font-sans">Реплик:</span>
                        <span className="font-semibold text-emerald-400">{project.total_replicas}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 mr-1.5 font-sans">Слов:</span>
                        <span className="font-semibold text-amber-300">{project.total_words.toLocaleString()}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 mr-1.5 font-sans">Время:</span>
                        <span className="font-semibold text-sky-300">{formatDuration(project.total_seconds)}</span>
                      </div>

                      <button
                        type="button"
                        disabled={isRecalculatingThisTitle}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRecalculateTitle(project.id)
                        }}
                        className="flex items-center gap-1 rounded bg-slate-800 hover:bg-indigo-600 px-2.5 py-1 text-[11px] font-sans font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                        title="Пересчитать реплики и слова во всех главах тайтла"
                      >
                        {isRecalculatingThisTitle ? (
                          <Loader2 className="h-3 w-3 animate-spin text-white" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Пересчитать тайтл
                      </button>
                    </div>
                  </div>

                  {/* Таблица глав тайтла */}
                  {isExpanded && (
                    <div className="p-3">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="px-3 py-2">Глава</th>
                            <th className="px-3 py-2 text-center">Страниц</th>
                            <th className="px-3 py-2 text-center">Реплик (перевод)</th>
                            <th className="px-3 py-2 text-center">Русских слов</th>
                            <th className="px-3 py-2 text-center">Время работы</th>
                            <th className="px-3 py-2 text-right">Действие</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {project.chapters.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-4 text-center text-slate-500">
                                Глав нет
                              </td>
                            </tr>
                          ) : (
                            project.chapters.map((ch) => {
                              const isCurrent = ch.id === currentChapterId
                              const isRecalculating = recalculatingChapterId === ch.id

                              return (
                                <tr
                                  key={ch.id}
                                  className={`hover:bg-slate-900/60 transition-colors ${
                                    isCurrent ? "bg-indigo-950/20 font-medium" : ""
                                  }`}
                                >
                                  <td className="px-3 py-2.5 text-slate-200">
                                    <div className="flex items-center gap-2">
                                      {ch.is_timer_running && (
                                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Таймер запущен прямо сейчас" />
                                      )}
                                      <span>Глава {ch.chapter_number}</span>
                                      {isCurrent && (
                                        <span className="rounded bg-indigo-500/20 text-indigo-300 text-[10px] px-1.5 py-0.2 border border-indigo-500/30">
                                          текущая
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-center font-mono text-slate-400">{ch.pages_count}</td>
                                  <td className="px-3 py-2.5 text-center font-mono">
                                    {ch.replicas_count !== null ? (
                                      <span className="text-emerald-400">{ch.replicas_count}</span>
                                    ) : (
                                      <span className="text-slate-600 italic">не считалось</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center font-mono">
                                    {ch.words_count !== null ? (
                                      <span className="text-amber-300">{ch.words_count.toLocaleString()}</span>
                                    ) : (
                                      <span className="text-slate-600 italic">не считалось</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center font-mono">
                                    <span className={ch.is_timer_running ? "text-emerald-400 font-bold" : "text-sky-300"}>
                                      {formatDuration(ch.work_seconds)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <button
                                      type="button"
                                      disabled={isRecalculating}
                                      onClick={() => handleRecalculateChapter(ch.id)}
                                      className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                                      title="Пересчитать реплики и слова в этой главе"
                                    >
                                      {isRecalculating ? (
                                        <Loader2 className="h-3 w-3 animate-spin text-white" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3 text-indigo-400" />
                                      )}
                                      Пересчитать
                                    </button>
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
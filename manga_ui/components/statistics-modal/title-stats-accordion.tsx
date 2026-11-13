// manga_ui/components/statistics-modal/title-stats-accordion.tsx
// Карточка тайтла со сводными цифрами, раскрывающейся таблицей глав и кнопками пересчёта

"use client"

import { RefreshCw, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import type { TitleDetailedItem } from "@/lib/api"
import { formatDuration } from "./stats-summary-bar"

export interface TitleStatsAccordionProps {
  project: TitleDetailedItem
  isExpanded: boolean
  currentChapterId?: number | null
  recalculatingChapterId: number | null
  recalculatingTitleId: number | null
  onToggle: (titleId: number) => void
  onRecalculateTitle: (titleId: number) => void
  onRecalculateChapter: (chapterId: number) => void
}

export function TitleStatsAccordion({
  project,
  isExpanded,
  currentChapterId,
  recalculatingChapterId,
  recalculatingTitleId,
  onToggle,
  onRecalculateTitle,
  onRecalculateChapter,
}: TitleStatsAccordionProps) {
  const isRecalculatingThisTitle = recalculatingTitleId === project.id

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
      {/* Заголовок тайтла */}
      <div
        onClick={() => onToggle(project.id)}
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
              onRecalculateTitle(project.id)
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
                          onClick={() => onRecalculateChapter(ch.id)}
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
}

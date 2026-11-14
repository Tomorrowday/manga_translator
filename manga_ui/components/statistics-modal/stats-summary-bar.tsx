// manga_ui/components/statistics-modal/stats-summary-bar.tsx
// Верхняя сводка по всей базе: страницы, переведённые реплики, русские слова и затраченное время

"use client"

import { BookOpen, MessageSquare, FileText, Clock } from "lucide-react"

export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "0м 00с"
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}ч ${minutes.toString().padStart(2, "0")}м ${seconds.toString().padStart(2, "0")}с`
  }
  return `${minutes}м ${seconds.toString().padStart(2, "0")}с`
}

export interface StatsSummaryBarProps {
  totalPages: number
  totalReplicas: number
  totalWords: number
  totalSeconds: number
}

export function StatsSummaryBar({
  totalPages,
  totalReplicas,
  totalWords,
  totalSeconds,
}: StatsSummaryBarProps) {
  return (
    <div className="grid grid-cols-4 gap-3 border-b border-slate-800/80 bg-slate-950/40 p-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <BookOpen className="h-4 w-4 text-indigo-400" />
          Всего страниц
        </div>
        <div className="mt-1.5 text-xl font-bold text-white font-mono">{totalPages}</div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <MessageSquare className="h-4 w-4 text-emerald-400" />
          Переведено реплик
        </div>
        <div className="mt-1.5 text-xl font-bold text-emerald-400 font-mono">{totalReplicas}</div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <FileText className="h-4 w-4 text-amber-400" />
          Слов (русских)
        </div>
        <div className="mt-1.5 text-xl font-bold text-amber-300 font-mono">{totalWords.toLocaleString()}</div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Clock className="h-4 w-4 text-sky-400" />
          Затрачено времени
        </div>
        <div className="mt-1.5 text-xl font-bold text-sky-300 font-mono">{formatDuration(totalSeconds)}</div>
      </div>
    </div>
  )
}

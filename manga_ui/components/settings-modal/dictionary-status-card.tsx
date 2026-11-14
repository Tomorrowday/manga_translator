// manga_ui/components/settings-modal/dictionary-status-card.tsx
// Карточка управления локальным японско-русским словарём (Warodai + JMdict RU)
// и выбора NLP-модели (Sudachi / GiNZA Electra / BERT-large)

"use client"

import { useState, useEffect, useCallback } from "react"
import { BookOpenCheck, Download, RefreshCw, Loader2, Cpu } from "lucide-react"
import {
  getDictionaryStatus,
  triggerDictionaryBuild,
  type DictStatusResponse,
} from "@/lib/api/dictionary"

export type DictNlpMode = "auto" | "sudachi" | "electra" | "bert_large"

export interface DictionaryStatusCardProps {
  dictNlpMode: DictNlpMode
  onDictNlpModeChange: (mode: DictNlpMode) => void
}

export function DictionaryStatusCard({
  dictNlpMode,
  onDictNlpModeChange,
}: DictionaryStatusCardProps) {
  const [status, setStatus] = useState<DictStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getDictionaryStatus()
      setStatus(res)
      if (res.build_progress?.is_building) {
        setBuilding(true)
      } else {
        setBuilding(false)
      }
    } catch (e) {
      console.warn("Не удалось получить статус словаря:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Опрашиваем прогресс, пока идёт сборка словаря
  useEffect(() => {
    if (!building) return
    const timer = setInterval(() => {
      fetchStatus()
    }, 1500)
    return () => clearInterval(timer)
  }, [building, fetchStatus])

  const handleBuild = async (forceRebuild: boolean) => {
    if (building) return
    setBuilding(true)
    try {
      const res = await triggerDictionaryBuild(forceRebuild)
      if (res.status) {
        setStatus(res.status)
      } else {
        await fetchStatus()
      }
    } catch (e) {
      alert("Ошибка сборки словаря: " + String(e))
    } finally {
      setBuilding(false)
    }
  }

  const totalEntries = status?.total_entries ?? 0
  const warodaiCount = status?.sources?.warodai ?? 0
  const jmdictCount = status?.sources?.jmdict_ru ?? 0
  const isFull = Boolean(status?.is_full_dictionary_loaded)
  const activeBackend = status?.nlp?.active_backend || "sudachipy"

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <span className="text-xs font-semibold text-slate-200">
              Локальный словарь (Warodai + JMdict RU)
            </span>
            <p className="text-[11px] text-slate-500">
              Офлайн-база data/jp_dict.sqlite • Активный NLP: <span className="text-indigo-300 font-mono">{activeBackend}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={[
              "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border",
              building
                ? "bg-amber-950 text-amber-300 border-amber-800"
                : isFull
                  ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                  : "bg-slate-900 text-slate-300 border-slate-700",
            ].join(" ")}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                building
                  ? "bg-amber-400 animate-ping"
                  : isFull
                    ? "bg-emerald-400"
                    : "bg-slate-400"
              }`}
            />
            {building
              ? "Индексация..."
              : loading
                ? "Проверка..."
                : isFull
                  ? `${totalEntries.toLocaleString()} статей`
                  : `Стартовый (${totalEntries} ст.)`}
          </span>

          <button
            type="button"
            onClick={() => handleBuild(false)}
            disabled={building}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 disabled:opacity-50 transition-colors"
            title="Скачать и проиндексировать полные словари Warodai и JMdict RU"
          >
            {building ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isFull ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            <span>{isFull ? "Пересобрать" : "Скачать базу"}</span>
          </button>
        </div>
      </div>

      {status && (warodaiCount > 0 || jmdictCount > 0) && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span>
            Warodai (БЯРС): <strong className="text-amber-300 font-mono">{warodaiCount.toLocaleString()}</strong>
          </span>
          <span>•</span>
          <span>
            JMdict RU: <strong className="text-sky-300 font-mono">{jmdictCount.toLocaleString()}</strong>
          </span>
        </div>
      )}

      {building && status?.build_progress?.message && (
        <div className="rounded border border-amber-800/50 bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">
          {status.build_progress.message}
        </div>
      )}

      {/* Выбор модели морфологического анализатора (NLP) */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
        <div className="pr-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Cpu className="h-3.5 w-3.5 text-indigo-400" />
            Морфологический анализатор японского текста
          </label>
          <p className="text-[10px] text-slate-500">
            Разбивает фразы на слова, определяет начальную форму и находит имена персонажей.
          </p>
        </div>

        <select
          value={dictNlpMode}
          onChange={(e) =>
            onDictNlpModeChange(e.target.value as DictNlpMode)
          }
          className="w-56 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-100 outline-none focus:border-indigo-500"
        >
          <option value="auto">Auto (SudachiPy + GiNZA)</option>
          <option value="sudachi">SudachiPy (Сверхбыстрый CPU, 1 мс)</option>
          <option value="electra">GiNZA Electra (Трансформер GPU)</option>
          <option value="bert_large">GiNZA BERT-large (Макс. точность GPU)</option>
        </select>
      </div>
    </div>
  )
}

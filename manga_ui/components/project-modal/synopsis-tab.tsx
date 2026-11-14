// manga_ui/components/project-modal/synopsis-tab.tsx
// Вкладка «Синопсис»: текстовое поле описания тайтла и кнопка сохранения

"use client"

import { Loader2, Save, Check } from "lucide-react"

export interface SynopsisTabProps {
  description: string
  onDescriptionChange: (value: string) => void
  loading: boolean
  isSaving: boolean
  savedSuccess: boolean
  onSave: () => void
}

export function SynopsisTab({
  description,
  onDescriptionChange,
  loading,
  isSaving,
  savedSuccess,
  onSave,
}: SynopsisTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Синопсис, атмосфера и правила речи персонажей
        </label>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-slate-400" /> Загрузка...
          </div>
        ) : (
          <textarea
            rows={10}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Например:
Мрачный сёнэн с элементами комедии абсурда."
            className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500">
            Автоматически включается в экспортируемый файл контекста.
          </span>

          <button
            onClick={onSave}
            disabled={isSaving}
            className={[
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-all shadow-md",
              savedSuccess
                ? "bg-emerald-600"
                : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50",
            ].join(" ")}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : savedSuccess ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {savedSuccess ? "Сохранено!" : "Сохранить синопсис"}
          </button>
        </div>
      </div>
    </div>
  )
}

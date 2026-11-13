// manga_ui/components/project-modal/glossary-tab.tsx
// Вкладка «Глоссарий»: подсказка, форма добавления термина и таблица с удалением

"use client"

import { Sparkles, Plus, Trash2, Loader2 } from "lucide-react"
import type { GlossaryItem } from "@/lib/types"

export interface GlossaryTabProps {
  glossary: GlossaryItem[]
  loading: boolean
  isAdding: boolean
  japWord: string
  rusWord: string
  context: string
  onJapWordChange: (value: string) => void
  onRusWordChange: (value: string) => void
  onContextChange: (value: string) => void
  onAdd: () => void
  onDelete: (id: number) => Promise<void>
}

export function GlossaryTab({
  glossary,
  loading,
  isAdding,
  japWord,
  rusWord,
  context,
  onJapWordChange,
  onRusWordChange,
  onContextChange,
  onAdd,
  onDelete,
}: GlossaryTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-indigo-950 bg-indigo-950/30 p-3.5 text-xs text-indigo-200">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
        <p>
          Имена и термины из глоссария попадают в экспортируемый файл контекста для Claude/ChatGPT,
          а также пополняют список подсказок в поле «Speaker».
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onAdd()
        }}
        className="flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3"
      >
        <input
          type="text"
          placeholder="Японский (опционально)"
          value={japWord}
          onChange={(e) => onJapWordChange(e.target.value)}
          className="w-1/3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <input
          type="text"
          required
          placeholder="Имя/Роль"
          value={rusWord}
          onChange={(e) => onRusWordChange(e.target.value)}
          className="w-1/3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Контекст/тон"
          value={context}
          onChange={(e) => onContextChange(e.target.value)}
          className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isAdding}
          className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Японский оригинал</th>
              <th className="px-4 py-2.5 font-semibold">Имя / Термин</th>
              <th className="px-4 py-2.5 font-semibold">Контекст / Роль</th>
              <th className="w-10 px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {loading ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1 text-slate-400" />
                  Загрузка глоссария...
                </td>
              </tr>
            ) : glossary.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-500">
                  Глоссарий пока пуст. Добавьте персонажей или термины выше.
                </td>
              </tr>
            ) : (
              glossary.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-slate-200">
                    {item.jap_word || <span className="text-slate-500 italic">—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-emerald-400">{item.rus_word}</td>
                  <td className="px-4 py-2.5 text-slate-400">{item.context || "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => onDelete(item.id)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

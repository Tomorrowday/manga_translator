// manga_ui/components/settings-modal/ollama-status-card.tsx
// Блок проверки статуса локального сервера Ollama и списка обнаруженных моделей

"use client"

import { Bot, RefreshCw } from "lucide-react"

export type OllamaStatus = "checking" | "online" | "offline"

export interface OllamaStatusCardProps {
  status: OllamaStatus
  models: string[]
  onRefresh: () => void
}

export function OllamaStatusCard({ status, models, onRefresh }: OllamaStatusCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-emerald-400" />
          <div>
            <span className="text-xs font-semibold text-slate-200">Локальная нейросеть (Ollama)</span>
            <p className="text-[11px] text-slate-500">http://localhost:11434</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={[
            "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            status === "online" ? "bg-emerald-950 text-emerald-300 border border-emerald-800" :
            status === "checking" ? "bg-amber-950 text-amber-300 border border-amber-800" :
            "bg-rose-950 text-rose-300 border border-rose-800"
          ].join(" ")}>
            <span className={`h-1.5 w-1.5 rounded-full ${status === "online" ? "bg-emerald-400" : status === "checking" ? "bg-amber-400 animate-ping" : "bg-rose-400"}`} />
            {status === "online" ? "Подключена" : status === "checking" ? "Проверка..." : "Не запущена"}
          </span>

          <button
            type="button"
            onClick={onRefresh}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Проверить соединение с Ollama"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {status === "online" && models.length > 0 && (
        <p className="text-[11px] text-slate-400 pt-1">
          Обнаружены модели: <span className="text-emerald-300 font-mono">{models.join(", ")}</span>
        </p>
      )}
    </div>
  )
}

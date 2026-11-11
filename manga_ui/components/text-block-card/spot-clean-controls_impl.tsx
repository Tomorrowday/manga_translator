// manga_ui/components/text-block-card/spot-clean-controls_impl.tsx
// Единый компактный компонент кнопок точечной очистки бабла (Spot Clean)

"use client"

import { useState } from "react"
import { Eraser, Loader2 } from "lucide-react"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import type { SpotCleanControlsProps } from "./spot-clean-controls"

export function SpotCleanControls({ onSpotClean }: SpotCleanControlsProps) {
  const [loading, setLoading] = useState(false)
  const { hotkeys } = useHotkeysConfig()

  if (!onSpotClean) return null

  const handleClean = async (
    e: React.MouseEvent,
    method: "auto" | "lama" | "white",
    deleteAfter = false
  ) => {
    e.stopPropagation()
    setLoading(true)
    try {
      await onSpotClean(method, deleteAfter)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={(e) => handleClean(e, "white", false)}
        className="h-6 rounded border border-slate-700 bg-slate-900 px-1.5 text-[10px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
        title={`Белый клин [${hotkeys.spotWhite.label}]`}
      >
        {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin inline mr-0.5" /> : null}
        White [{hotkeys.spotWhite.label}]
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={(e) => handleClean(e, "lama", false)}
        className="h-6 rounded bg-purple-900/60 px-1.5 text-[10px] font-medium text-purple-200 hover:bg-purple-800 disabled:opacity-50 transition-colors whitespace-nowrap"
        title={`Стереть нейросетью LaMa [${hotkeys.spotLama.label}]`}
      >
        LaMa [{hotkeys.spotLama.label}]
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={(e) => handleClean(e, "white", true)}
        className="flex items-center gap-0.5 h-6 rounded border border-slate-700 bg-slate-850 px-1.5 text-[10px] font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
        title={`Белый клин и сразу удалить рамку [${hotkeys.spotWhiteDel.label}]`}
      >
        <Eraser className="h-2.5 w-2.5 text-slate-400" />
        W&Del
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={(e) => handleClean(e, "lama", true)}
        className="flex items-center gap-0.5 h-6 rounded border border-rose-800/60 bg-rose-950/40 px-1.5 text-[10px] font-medium text-rose-300 hover:bg-rose-900/60 disabled:opacity-50 transition-colors whitespace-nowrap"
        title={`Стереть нейросетью LaMa и сразу удалить рамку [${hotkeys.spotLamaDel.label}]`}
      >
        <Eraser className="h-2.5 w-2.5 text-rose-400" />
        L&Del
      </button>
    </div>
  )
}
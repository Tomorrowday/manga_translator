"use client"

import { useState } from "react"
import { Sparkles, Eraser, Loader2 } from "lucide-react"
import { BUBBLE_HOTKEYS } from "@/lib/hotkeys"

interface SpotCleanControlsProps {
  onSpotClean?: (method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
}

export function SpotCleanControls({ onSpotClean }: SpotCleanControlsProps) {
  const [loading, setLoading] = useState(false)

  if (!onSpotClean) return null

  const handleClean = async (method: "auto" | "lama" | "white", deleteAfter = false) => {
    setLoading(true)
    try {
      await onSpotClean(method, deleteAfter)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 flex items-center justify-between rounded-md border border-purple-950/60 bg-purple-950/20 p-1.5 text-xs"
    >
      <span className="flex items-center gap-1 text-[11px] font-medium text-purple-300 shrink-0">
        <Sparkles className="h-3 w-3 text-purple-400" />
        Spot:
      </span>

      <div className="flex items-center gap-1">
        {/* 1. White */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleClean("white", false)}
          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
          title={`Белый клин [${BUBBLE_HOTKEYS.spotWhite.label}]`}
        >
          {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
          White [{BUBBLE_HOTKEYS.spotWhite.label}]
        </button>

        {/* 2. LaMa */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleClean("lama", false)}
          className="flex items-center gap-1 rounded bg-purple-900/60 px-1.5 py-0.5 text-[10px] font-medium text-purple-200 hover:bg-purple-800 disabled:opacity-50 transition-colors"
          title={`Принудительно стереть нейросетью LaMa [${BUBBLE_HOTKEYS.spotLama.label}]`}
        >
          {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
          LaMa [{BUBBLE_HOTKEYS.spotLama.label}]
        </button>

        {/* 3. White & Del */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleClean("white", true)}
          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-850 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
          title={`Выбелить и сразу удалить рамку [${BUBBLE_HOTKEYS.spotWhiteDel.label}]`}
        >
          <Eraser className="h-2.5 w-2.5 text-slate-400" />
          White & Del
        </button>

        {/* 4. LaMa & Del */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleClean("lama", true)}
          className="flex items-center gap-1 rounded border border-rose-800/60 bg-rose-950/40 px-1.5 py-0.5 text-[10px] font-medium text-rose-300 hover:bg-rose-900/60 disabled:opacity-50 transition-colors"
          title={`Стереть нейросетью LaMa и сразу удалить рамку [${BUBBLE_HOTKEYS.spotLamaDel.label}]`}
        >
          <Eraser className="h-2.5 w-2.5 text-rose-400" />
          LaMa & Del
        </button>
      </div>
    </div>
  )
}
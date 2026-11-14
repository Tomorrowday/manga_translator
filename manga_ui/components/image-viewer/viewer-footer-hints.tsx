// manga_ui/components/image-viewer/viewer-footer-hints.tsx
// Подвал вьювера с подсказками горячих клавиш для режимов Box и Brush

"use client"

import { MousePointerSquareDashed } from "lucide-react"
import type { BrushMode } from "@/hooks/use-brush-tool"
import type { HotkeyConfig } from "@/lib/hotkeys"

export interface ViewerFooterHintsProps {
  activeTool: "box" | "brush"
  brushMode: BrushMode
  hotkeys: HotkeyConfig
}

export function ViewerFooterHints({ activeTool, brushMode, hotkeys }: ViewerFooterHintsProps) {
  return (
    <footer className="flex items-center justify-between border-t border-slate-800 px-5 py-2 text-xs text-slate-400 bg-slate-950/60 shrink-0">
      <div className="flex items-center gap-2 truncate pr-2">
        <MousePointerSquareDashed className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        {activeTool === "brush" ? (
          <span className="text-pink-300 font-medium truncate">
            Режим кисти: {brushMode.toUpperCase()} | Закрасьте область и отпустите мышь.
          </span>
        ) : (
          <span className="truncate">8 точек для размера. Двойной клик — редактирование текста.</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 shrink-0">
        {activeTool === "brush" ? (
          <>
            <span className="text-slate-400">Размер кисти:</span>
            <kbd className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-pink-300 border border-slate-700">
              {hotkeys.brushSizeUp.label}
            </kbd>
            больше
            <kbd className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-pink-300 border border-slate-700">
              {hotkeys.brushSizeDown.label}
            </kbd>
            меньше
          </>
        ) : (
          <>
            <span className="text-amber-400 font-medium">1-7 Font</span>
            <span className="mx-1 text-slate-700">|</span>
            <span>Порядок:</span>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-violet-300 border border-slate-700">
              {hotkeys.moveOrderUp.label}
            </kbd>{" "}
            /{" "}
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-violet-300 border border-slate-700">
              {hotkeys.moveOrderDown.label}
            </kbd>
            <span className="mx-1 text-slate-700">|</span>
            <span>Spot:</span>
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-200 border border-slate-700">
              {hotkeys.spotWhite.label}
            </kbd>{" "}
            White
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-purple-300 border border-slate-700">
              {hotkeys.spotLama.label}
            </kbd>{" "}
            LaMa
            <span className="mx-1 text-slate-700">|</span>
            <span>Бабл:</span>
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-indigo-300 border border-slate-700">
              {hotkeys.toggleShape.label}
            </kbd>{" "}
            Oval
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-sky-300 border border-slate-700">
              {hotkeys.fontSizeDown.label} / {hotkeys.fontSizeUp.label}
            </kbd>{" "}
            Font
            <span className="mx-1 text-slate-700">|</span>
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-amber-300 border border-slate-700">
              {hotkeys.toggleJapCheck.label}
            </kbd>{" "}
            JP
          </>
        )}
        <span className="mx-1 text-slate-700">|</span>
        <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300 border border-slate-700">
          {hotkeys.toggleViewMode.label}
        </kbd>{" "}
        Scan
      </div>
    </footer>
  )
}

// manga_ui/components/image-viewer/viewer-header-toolbar.tsx
// Шапка вьювера: заголовок страницы, переключатель Box / Brush, режимы кисти и Original / Cleaned

"use client"

import { BoxSelect, Image as ImageIcon, Paintbrush, Sparkles } from "lucide-react"
import type { BrushMode } from "@/hooks/use-brush-tool"
import type { HotkeyConfig } from "@/lib/hotkeys"

export interface ViewerHeaderToolbarProps {
  pageNumber?: number
  imageSrc: string | null
  activeTool: "box" | "brush"
  brushMode: BrushMode
  brushSize: number
  viewMode: "original" | "clean"
  hasCleanScan: boolean
  hotkeys: HotkeyConfig
  onToolChange: (tool: "box" | "brush") => void
  onBrushModeChange: (mode: BrushMode) => void
  onBrushResize: (delta: number) => void
  onToggleViewMode: () => void
}

export function ViewerHeaderToolbar({
  pageNumber,
  imageSrc,
  activeTool,
  brushMode,
  brushSize,
  viewMode,
  hasCleanScan,
  hotkeys,
  onToolChange,
  onBrushModeChange,
  onBrushResize,
  onToggleViewMode,
}: ViewerHeaderToolbarProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3 shrink-0">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            {pageNumber !== undefined ? `Page ${pageNumber}` : "Page Viewer"}
          </h2>
          <p className="text-xs text-slate-500">
            {activeTool === "brush"
              ? brushMode === "lama"
                ? "AI-ретушь: закрасьте дефект для удаления (LaМа)"
                : brushMode === "white"
                  ? "Заливка: закрасьте область чистым белым цветом"
                  : "Заливка: закрасьте область чистым чёрным цветом"
              : imageSrc
                ? "Выделяйте баблы рамкой"
                : "Выберите страницу"}
          </p>
        </div>

        {imageSrc && (
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1 ml-2">
            <button
              type="button"
              onClick={() => onToolChange("box")}
              className={[
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all",
                activeTool === "box"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
              ].join(" ")}
              title="Инструмент «Рамка бабла»"
            >
              <BoxSelect className="h-3.5 w-3.5" />
              Box
            </button>

            <button
              type="button"
              onClick={() => onToolChange("brush")}
              className={[
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all",
                activeTool === "brush"
                  ? "bg-pink-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
              ].join(" ")}
              title="Кисть (LaMa, Белый или Чёрный)"
            >
              <Paintbrush className="h-3.5 w-3.5" />
              Brush
            </button>
          </div>
        )}

        {activeTool === "brush" && imageSrc && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => onBrushModeChange("lama")}
              className={[
                "px-2 py-1 rounded text-xs font-medium transition-colors",
                brushMode === "lama"
                  ? "bg-pink-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
              ].join(" ")}
              title="Удаление нейросетью LaMa"
            >
              LaMa
            </button>

            <button
              type="button"
              onClick={() => onBrushModeChange("white")}
              className={[
                "px-2 py-1 rounded text-xs font-semibold transition-colors",
                brushMode === "white"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-white",
              ].join(" ")}
              title="Покрасить белым цветом"
            >
              White
            </button>

            <button
              type="button"
              onClick={() => onBrushModeChange("black")}
              className={[
                "px-2 py-1 rounded text-xs font-semibold transition-colors border",
                brushMode === "black"
                  ? "bg-slate-900 border-slate-600 text-white shadow-sm"
                  : "border-transparent text-slate-400 hover:text-slate-200",
              ].join(" ")}
              title="Покрасить чёрным цветом"
            >
              Black
            </button>
          </div>
        )}

        {activeTool === "brush" && imageSrc && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs">
            <span className="text-[11px] font-medium text-slate-400">
              Размер ({hotkeys.brushSizeUp.label}/{hotkeys.brushSizeDown.label}):
            </span>
            <input
              type="range"
              min="6"
              max="140"
              value={brushSize}
              onChange={(e) => onBrushResize(Number(e.target.value) - brushSize)}
              className="h-1.5 w-20 cursor-pointer accent-pink-500"
            />
            <span className="w-6 text-[11px] font-mono text-pink-300">{brushSize}px</span>
          </div>
        )}
      </div>

      {imageSrc && (
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
          <button
            onClick={onToggleViewMode}
            disabled={!hasCleanScan && viewMode === "original"}
            className={[
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all",
              viewMode === "original" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200",
            ].join(" ")}
            title={`Показать исходный скан (${hotkeys.toggleViewMode.label})`}
          >
            <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
            Original
          </button>

          <button
            onClick={onToggleViewMode}
            disabled={!hasCleanScan}
            className={[
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-40",
              viewMode === "clean" ? "bg-purple-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200",
            ].join(" ")}
            title={hasCleanScan ? `Показать заклиненный скан (${hotkeys.toggleViewMode.label})` : "Сначала выполните клин"}
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-300" />
            Cleaned
          </button>
        </div>
      )}
    </header>
  )
}

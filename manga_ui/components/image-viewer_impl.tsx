// manga_ui/components/image-viewer_impl.tsx
// Инструменты разметки баблов и просмотр скана (адаптивная ширина flex-1)

"use client"

import type React from "react"
import { useRef, useState, useCallback, useEffect, useMemo } from "react"
import {
  FolderOpen,
  MousePointerSquareDashed,
  Sparkles,
  Image as ImageIcon,
  Paintbrush,
  BoxSelect,
  Loader2,
} from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { releaseVram } from "@/lib/api/pages"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import { useBoxTransform, type DrawRect } from "@/hooks/use-box-transform"
import { useBrushTool, type BrushMode } from "@/hooks/use-brush-tool"
import { BubbleOverlayItem } from "@/components/image-viewer/bubble-overlay-item"
import type { ImageViewerProps } from "./image-viewer"

interface ExtendedImageViewerProps extends ImageViewerProps {
  showSfx?: boolean
}

function normalize(a: number, b: number) {
  return { start: Math.min(a, b), size: Math.abs(a - b) }
}

export function ImageViewer({
  imageSrc,
  textBlocks,
  selectedId,
  showTypeset = false,
  showSfx = true,
  pageNumber,
  hasCleanScan = false,
  viewMode,
  defaultFontSize = 14,
  brushSize,
  onBrushResize,
  onToggleViewMode,
  onSelect,
  onDrawComplete,
  onUpdateBlock,
  onBrushClean,
}: ExtendedImageViewerProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const { hotkeys } = useHotkeysConfig()

  const [activeTool, setActiveTool] = useState<"box" | "brush">("box")
  const [brushMode, setBrushMode] = useState<BrushMode>("lama")

  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<DrawRect | null>(null)

  const prevToolRef = useRef(activeTool)
  useEffect(() => {
    if (prevToolRef.current === "brush" && activeTool !== "brush") {
      releaseVram()
    }
    prevToolRef.current = activeTool
  }, [activeTool])

  useEffect(() => {
    return () => {
      if (activeTool === "brush") {
        releaseVram()
      }
    }
  }, [activeTool])

  const pointFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
    return { x, y }
  }, [])

  const handleTransformComplete = useCallback(
    (rect: DrawRect, img: HTMLImageElement, id: string, rot: number) => {
      onDrawComplete(rect, img, id, rot)
    },
    [onDrawComplete]
  )

  const { isEditing, editId, editType, activeBox, activeRotation, startTransform } = useBoxTransform(
    imgRef,
    pointFromEvent,
    handleTransformComplete
  )

  const {
    brushCanvasRef,
    cursorRef,
    isBrushProcessing,
    handleBrushMouseDown,
    handleBrushMouseMove,
    handleBrushMouseUp,
    handleBrushMouseLeave,
  } = useBrushTool({
    imgRef,
    brushSize,
    brushMode,
    imageSrc,
    onBrushClean,
  })

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === "brush") return
    if (!imageSrc || isEditing) return
    const p = pointFromEvent(e)
    if (!p) return
    onSelect(null)
    setOrigin(p)
    setDraft({ x: p.x, y: p.y, width: 0, height: 0, rotation: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activeTool === "brush" || !origin) return
    const p = pointFromEvent(e)
    if (!p) return
    const hx = normalize(origin.x, p.x)
    const hy = normalize(origin.y, p.y)
    setDraft({ x: hx.start, y: hy.start, width: hx.size, height: hy.size, rotation: 0 })
  }

  const finishDraw = () => {
    if (activeTool === "brush") return
    if (draft && imgRef.current && draft.width > 0.01 && draft.height > 0.01) {
      onDrawComplete(draft, imgRef.current, undefined, 0)
    }
    setOrigin(null)
    setDraft(null)
  }

  const visibleBoxes = useMemo(() => {
    const filtered = showSfx ? textBlocks : textBlocks.filter((b) => (b.class_id ?? 0) !== 3)
    return draft ? [...filtered, { id: "__draft__", ...draft } as TextBlock] : filtered
  }, [textBlocks, showSfx, draft])

  return (
    <section className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden">
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
                onClick={() => {
                  setActiveTool("box")
                  if (cursorRef.current) cursorRef.current.style.display = "none"
                }}
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
                onClick={() => setActiveTool("brush")}
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
                onClick={() => setBrushMode("lama")}
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
                onClick={() => setBrushMode("white")}
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
                onClick={() => setBrushMode("black")}
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

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!imageSrc ? (
          <div className="flex h-full min-h-[420px] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
            <div className="rounded-full bg-slate-800 p-4 text-indigo-400">
              <FolderOpen className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-slate-300">No page selected</p>
            <p className="text-xs text-slate-500">Select a chapter page in the Project Explorer to begin</p>
          </div>
        ) : (
          <div
            className="relative inline-block w-full select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={finishDraw}
            onMouseLeave={finishDraw}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              crossOrigin="anonymous"
              src={imageSrc}
              alt="Manga page"
              draggable={false}
              className="block w-full rounded-lg border border-slate-800"
            />

            <canvas
              ref={brushCanvasRef}
              onMouseDown={handleBrushMouseDown}
              onMouseMove={handleBrushMouseMove}
              onMouseUp={handleBrushMouseUp}
              onMouseLeave={handleBrushMouseLeave}
              className={[
                "absolute inset-0 z-30 touch-none",
                activeTool === "brush" ? "pointer-events-auto cursor-none" : "pointer-events-none hidden",
              ].join(" ")}
            />

            {activeTool === "brush" && (
              <div
                ref={cursorRef}
                className="pointer-events-none absolute left-0 top-0 z-50 rounded-full border border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.85)] will-change-transform"
                style={{
                  width: brushSize,
                  height: brushSize,
                  display: "none",
                }}
              >
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.9)]" />
              </div>
            )}

            {isBrushProcessing && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-lg">
                <div className="flex items-center gap-2 rounded-lg border border-pink-500/50 bg-slate-950/90 px-3 py-2 text-xs font-medium text-pink-300 shadow-2xl">
                  <Loader2 className="h-4 w-4 animate-spin text-pink-400" />
                  {brushMode === "lama" ? "LaMa Inpainting..." : "Applying fill..."}
                </div>
              </div>
            )}

            {activeTool === "box" &&
              visibleBoxes.map((box, index) => (
                <BubbleOverlayItem
                  key={box.id}
                  box={box}
                  index={index}
                  isSelected={box.id === selectedId}
                  showTypeset={showTypeset}
                  imgElement={imgRef.current}
                  isEditingCurrent={isEditing && editId === box.id}
                  editType={editType}
                  activeBox={activeBox}
                  activeRotation={activeRotation}
                  defaultFontSize={defaultFontSize}
                  onStartTransform={startTransform}
                  onSelect={onSelect}
                  onUpdate={onUpdateBlock}
                />
              ))}
          </div>
        )}
      </div>

      {imageSrc && (
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
              </>
            )}
            <span className="mx-1 text-slate-700">|</span>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300 border border-slate-700">
              {hotkeys.toggleViewMode.label}
            </kbd>{" "}
            Scan
          </div>
        </footer>
      )}
    </section>
  )
}
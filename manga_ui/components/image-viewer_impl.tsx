// manga_ui/components/image-viewer_impl.tsx
// Инструменты разметки баблов, режим проверки японского текста (JP Check) и просмотр скана

"use client"

import type React from "react"
import { useRef, useState, useCallback, useEffect, useMemo } from "react"
import { FolderOpen, Loader2 } from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { releaseVram } from "@/lib/api/pages"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import { useBoxTransform, type DrawRect } from "@/hooks/use-box-transform"
import { useBrushTool, type BrushMode } from "@/hooks/use-brush-tool"
import { BubbleOverlayItem } from "@/components/image-viewer/bubble-overlay-item"
import { ViewerHeaderToolbar } from "@/components/image-viewer/viewer-header-toolbar"
import { ViewerFooterHints } from "@/components/image-viewer/viewer-footer-hints"
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
  showJapOverlay,
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
  const [internalJapOverlay, setInternalJapOverlay] = useState<boolean>(false)

  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<DrawRect | null>(null)

  const effectiveShowJapOverlay = showJapOverlay !== undefined ? showJapOverlay : internalJapOverlay

  // Синхронизация автономного переключения JP Check через глобальное событие (если проп не передан сверху)
  useEffect(() => {
    const handleToggleJapEvent = () => {
      setInternalJapOverlay((prev) => {
        const next = !prev
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent("manga-jap-check-changed", { detail: { value: next } }))
        })
        return next
      })
    }
    window.addEventListener("manga-toggle-jap-check", handleToggleJapEvent)
    return () => window.removeEventListener("manga-toggle-jap-check", handleToggleJapEvent)
  }, [])

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

  const handleToolChange = (tool: "box" | "brush") => {
    setActiveTool(tool)
    if (tool === "box" && cursorRef.current) cursorRef.current.style.display = "none"
  }

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
      <ViewerHeaderToolbar
        pageNumber={pageNumber}
        imageSrc={imageSrc}
        activeTool={activeTool}
        brushMode={brushMode}
        brushSize={brushSize}
        viewMode={viewMode}
        hasCleanScan={hasCleanScan}
        hotkeys={hotkeys}
        onToolChange={handleToolChange}
        onBrushModeChange={setBrushMode}
        onBrushResize={onBrushResize}
        onToggleViewMode={onToggleViewMode}
      />

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
                  showJapOverlay={effectiveShowJapOverlay}
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

      {imageSrc && <ViewerFooterHints activeTool={activeTool} brushMode={brushMode} hotkeys={hotkeys} />}
    </section>
  )
}

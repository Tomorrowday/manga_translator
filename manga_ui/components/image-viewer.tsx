"use client"

import type React from "react"
import { useRef, useState, useCallback, useEffect } from "react"
import { FolderOpen, MousePointerSquareDashed, Sparkles, Image as ImageIcon } from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { BUBBLE_HOTKEYS } from "@/lib/hotkeys"
import { useBoxTransform, type DrawRect } from "@/hooks/use-box-transform"
import { BubbleOverlayItem } from "@/components/image-viewer/bubble-overlay-item"

interface ImageViewerProps {
  imageSrc: string | null
  textBlocks: TextBlock[]
  selectedId: string | null
  showTypeset?: boolean
  pageNumber?: number
  hasCleanScan?: boolean
  viewMode: "original" | "clean"
  onToggleViewMode: () => void
  onSelect: (id: string | null) => void
  onDrawComplete: (rect: DrawRect, img: HTMLImageElement, existingId?: string, rotation?: number) => void
  onUpdateBlock?: (id: string, patch: Partial<TextBlock>) => void
}

function normalize(a: number, b: number) {
  return { start: Math.min(a, b), size: Math.abs(a - b) }
}

export function ImageViewer({
  imageSrc,
  textBlocks,
  selectedId,
  showTypeset = false,
  pageNumber,
  hasCleanScan = false,
  viewMode,
  onToggleViewMode,
  onSelect,
  onDrawComplete,
  onUpdateBlock,
}: ImageViewerProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<DrawRect | null>(null)

  // Переключение скана по нажатию клавиши Tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.key === "Tab" && hasCleanScan) {
        e.preventDefault()
        onToggleViewMode()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [hasCleanScan, onToggleViewMode])

  const pointFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
    return { x, y }
  }, [])

  // Хук трансформаций (ресайз, поворот, перемещение)
  const { isEditing, editId, editType, activeBox, activeRotation, startTransform } = useBoxTransform(
    imgRef,
    pointFromEvent,
    (rect, img, id, rot) => onDrawComplete(rect, img, id, rot)
  )

  // Рисование новой рамки
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc || isEditing) return
    const p = pointFromEvent(e)
    if (!p) return
    onSelect(null)
    setOrigin(p)
    setDraft({ x: p.x, y: p.y, width: 0, height: 0, rotation: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!origin) return
    const p = pointFromEvent(e)
    if (!p) return
    const hx = normalize(origin.x, p.x)
    const hy = normalize(origin.y, p.y)
    setDraft({ x: hx.start, y: hy.start, width: hx.size, height: hy.size, rotation: 0 })
  }

  const finishDraw = () => {
    if (draft && imgRef.current && draft.width > 0.01 && draft.height > 0.01) {
      onDrawComplete(draft, imgRef.current, undefined, 0)
    }
    setOrigin(null)
    setDraft(null)
  }

  const boxes = draft ? [...textBlocks, { id: "__draft__", ...draft } as TextBlock] : textBlocks

  return (
    <section className="flex min-h-0 w-full flex-col lg:w-3/5">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            {pageNumber !== undefined ? `Page ${pageNumber}` : "Page Viewer"}
          </h2>
          <p className="text-xs text-slate-500">
            {imageSrc ? "Click & drag over speech bubbles" : "Select a page from explorer"}
          </p>
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
              title="Показать исходный скан (Хоткей: Tab)"
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
              title={hasCleanScan ? "Показать заклиненный скан (Хоткей: Tab)" : "Сначала нажмите Clean для очистки"}
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
            style={{ cursor: "crosshair" }}
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
            {boxes.map((box, index) => (
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
                onStartTransform={startTransform}
                onSelect={onSelect}
                onUpdate={onUpdateBlock}
              />
            ))}
          </div>
        )}
      </div>

      {imageSrc && (
        <footer className="flex items-center justify-between border-t border-slate-800 px-5 py-2 text-xs text-slate-400 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <MousePointerSquareDashed className="h-3.5 w-3.5 text-slate-500" />
            <span>Resize from 8 points. Double click bubble to edit text inline.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>Spot:</span>
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-200 border border-slate-700">
              {BUBBLE_HOTKEYS.spotWhite.label}
            </kbd> White
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-purple-300 border border-slate-700">
              {BUBBLE_HOTKEYS.spotLama.label}
            </kbd> LaMa
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-rose-300 border border-slate-700">
              {BUBBLE_HOTKEYS.spotLamaDel.label}
            </kbd> Del
            <span className="mx-1 text-slate-700">|</span>
            <span>Бабл:</span>
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-indigo-300 border border-slate-700">
              {BUBBLE_HOTKEYS.toggleShape.label}
            </kbd> Oval
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-teal-300 border border-slate-700">
              {BUBBLE_HOTKEYS.toggleHyphenation.label}
            </kbd> No-Hyph
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-amber-300 border border-slate-700">
              {BUBBLE_HOTKEYS.toggleStroke.label}
            </kbd> Stroke
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-emerald-300 border border-slate-700">
              {BUBBLE_HOTKEYS.togglePadding.label}
            </kbd> Fit
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-sky-300 border border-slate-700">
              - / +
            </kbd> Font
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-violet-300 border border-slate-700">
              [ / ]
            </kbd> Order
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300 border border-slate-700">
              Tab
            </kbd> Scan
          </div>
        </footer>
      )}
    </section>
  )
}
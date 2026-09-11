"use client"

import type React from "react"
import { useRef, useState, useCallback, useEffect } from "react"
import { FolderOpen, MousePointerSquareDashed, Sparkles, Image as ImageIcon, RotateCw } from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { layoutBubbleTextLines } from "@/lib/typeset"
import { BUBBLE_HOTKEYS } from "@/lib/hotkeys"

interface DrawRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

type ResizeDirection = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se"
type EditAction = "move" | "rotate" | ResizeDirection

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
}

function normalize(a: number, b: number) {
  return { start: Math.min(a, b), size: Math.abs(a - b) }
}

const MIN_BLOCK_SIZE = 0.008

const RESIZE_HANDLES: Array<{
  dir: ResizeDirection
  cursor: string
  className: string
}> = [
  { dir: "nw", cursor: "cursor-nwse-resize", className: "-top-1.5 -left-1.5" },
  { dir: "n", cursor: "cursor-ns-resize", className: "-top-1.5 left-1/2 -translate-x-1/2" },
  { dir: "ne", cursor: "cursor-nesw-resize", className: "-top-1.5 -right-1.5" },
  { dir: "e", cursor: "cursor-ew-resize", className: "top-1/2 -right-1.5 -translate-y-1/2" },
  { dir: "se", cursor: "cursor-nwse-resize", className: "-bottom-1.5 -right-1.5" },
  { dir: "s", cursor: "cursor-ns-resize", className: "-bottom-1.5 left-1/2 -translate-x-1/2" },
  { dir: "sw", cursor: "cursor-nesw-resize", className: "-bottom-1.5 -left-1.5" },
  { dir: "w", cursor: "cursor-ew-resize", className: "top-1/2 -left-1.5 -translate-y-1/2" },
]

let previewCanvas: HTMLCanvasElement | null = null

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
}: ImageViewerProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<DrawRect | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editType, setEditType] = useState<EditAction | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [originalBox, setOriginalBox] = useState<DrawRect | null>(null)
  const [activeBox, setActiveBox] = useState<DrawRect | null>(null)
  const [activeRotation, setActiveRotation] = useState<number>(0)

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

  const handleBoxMouseDown = (e: React.MouseEvent, box: TextBlock, action: EditAction) => {
    e.stopPropagation()
    onSelect(box.id)
    const p = pointFromEvent(e)
    if (!p) return

    setIsEditing(true)
    setEditType(action)
    setEditId(box.id)
    setStartPoint(p)
    const initialRect: DrawRect = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rotation: box.rotation || 0,
    }
    setOriginalBox(initialRect)
    setActiveBox(initialRect)
    setActiveRotation(box.rotation || 0)
  }

  const computeUpdatedRect = useCallback(
    (orig: DrawRect, action: EditAction, dx: number, dy: number): DrawRect => {
      const updated = { ...orig }
      const currentRot = orig.rotation || 0

      if (action === "move") {
        updated.x = Math.max(0, Math.min(1 - orig.width, orig.x + dx))
        updated.y = Math.max(0, Math.min(1 - orig.height, orig.y + dy))
        return updated
      }

      // Проекция экранного смещения (dx, dy) в локальную повернутую систему координат бабла
      let localDx = dx
      let localDy = dy

      if (Math.abs(currentRot) >= 0.5) {
        const rad = (-currentRot * Math.PI) / 180
        localDx = dx * Math.cos(rad) - dy * Math.sin(rad)
        localDy = dx * Math.sin(rad) + dy * Math.cos(rad)
      }

      // 8-НАПРАВЛЕННЫЙ РАСЧЕТ
      if (action === "e" || action === "ne" || action === "se") {
        updated.width = Math.max(MIN_BLOCK_SIZE, Math.min(1 - orig.x, orig.width + localDx))
      } else if (action === "w" || action === "nw" || action === "sw") {
        const rightEdge = orig.x + orig.width
        const targetX = Math.max(0, Math.min(rightEdge - MIN_BLOCK_SIZE, orig.x + localDx))
        updated.x = targetX
        updated.width = rightEdge - targetX
      }

      if (action === "s" || action === "se" || action === "sw") {
        updated.height = Math.max(MIN_BLOCK_SIZE, Math.min(1 - orig.y, orig.height + localDy))
      } else if (action === "n" || action === "ne" || action === "nw") {
        const bottomEdge = orig.y + orig.height
        const targetY = Math.max(0, Math.min(bottomEdge - MIN_BLOCK_SIZE, orig.y + localDy))
        updated.y = targetY
        updated.height = bottomEdge - targetY
      }

      return updated
    },
    []
  )

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isEditing || !editId || !startPoint || !originalBox || !editType || !imgRef.current) return
      const p = pointFromEvent(e)
      if (!p) return

      if (editType === "rotate") {
        const cx = originalBox.x + originalBox.width / 2
        const cy = originalBox.y + originalBox.height / 2
        const imgRect = imgRef.current.getBoundingClientRect()
        const px = (p.x - cx) * imgRect.width
        const py = (p.y - cy) * imgRect.height

        let deg = (Math.atan2(py, px) * 180) / Math.PI + 90
        deg = ((deg + 180) % 360) - 180

        // Snap к 0 при малых углах (+-2 градуса)
        if (Math.abs(deg) < 2.0) deg = 0

        setActiveRotation(deg)
        return
      }

      const dx = p.x - startPoint.x
      const dy = p.y - startPoint.y
      const updated = computeUpdatedRect(originalBox, editType, dx, dy)
      setActiveBox(updated)
    }

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!isEditing || !editId || !startPoint || !originalBox || !imgRef.current || !editType) return

      const p = pointFromEvent(e)
      if (p) {
        if (editType === "rotate") {
          const finalRot = Math.round(activeRotation * 10) / 10
          onDrawComplete(originalBox, imgRef.current, editId, finalRot)
        } else {
          const dx = p.x - startPoint.x
          const dy = p.y - startPoint.y
          const finalRect = computeUpdatedRect(originalBox, editType, dx, dy)
          onDrawComplete(finalRect, imgRef.current, editId, originalBox.rotation || 0)
        }
      }

      setIsEditing(false)
      setEditType(null)
      setEditId(null)
      setStartPoint(null)
      setOriginalBox(null)
      setActiveBox(null)
    }

    if (isEditing) {
      window.addEventListener("mousemove", handleGlobalMouseMove)
      window.addEventListener("mouseup", handleGlobalMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [
    isEditing,
    editId,
    startPoint,
    originalBox,
    editType,
    activeRotation,
    onDrawComplete,
    pointFromEvent,
    computeUpdatedRect,
  ])

  const renderResizeAndRotateControls = (box: TextBlock, currentRot: number) => {
    return (
      <>
        {/* ХЭНДЛ ВРАЩЕНИЯ СВЕРХУ БАБЛА */}
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-40">
          <div
            onMouseDown={(e) => handleBoxMouseDown(e, box, "rotate")}
            className="h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-amber-400 shadow-md cursor-grab active:cursor-grabbing hover:scale-125 transition-transform flex items-center justify-center"
            title={`Повернуть бабл (Текущий: ${Math.round(currentRot)}°)`}
          >
            <RotateCw className="h-2 w-2 text-slate-900" />
          </div>
          <div className="h-3 w-[1.5px] bg-amber-400 shadow-sm" />
        </div>

        {/* 8 ТОЧЕК РЕСАЙЗА */}
        {RESIZE_HANDLES.map(({ dir, cursor, className }) => (
          <div
            key={dir}
            onMouseDown={(e) => handleBoxMouseDown(e, box, dir)}
            className={[
              "absolute z-30 h-2.5 w-2.5 rounded-sm border border-slate-900 bg-amber-400 shadow-sm transition-transform hover:scale-125",
              cursor,
              className,
            ].join(" ")}
            title={`Изменить размер (${dir.toUpperCase()})`}
          />
        ))}

        {/* БЕЙДЖ С ТЕКУЩИМ УГЛОМ ПРИ ВРАЩЕНИИ */}
        {isEditing && editType === "rotate" && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 border border-amber-500/50 shadow pointer-events-none whitespace-nowrap z-50">
            {Math.round(currentRot)}°
          </div>
        )}
      </>
    )
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
                viewMode === "original"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
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
                viewMode === "clean"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
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
            <p className="text-xs text-slate-500">
              Select a chapter page in the Project Explorer to begin
            </p>
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
            {boxes.map((box, index) => {
              const isDraft = box.id === "__draft__"
              const isSelected = box.id === selectedId
              const hasTranslation = !!box.rusText
              const isEllipse = box.shape === "ellipse"
              const padMode = box.paddingMode || "safe"

              const isCurrentlyActive = isEditing && editId === box.id && activeBox !== null
              const currentX = isCurrentlyActive ? activeBox.x : box.x
              const currentY = isCurrentlyActive ? activeBox.y : box.y
              const currentW = isCurrentlyActive ? activeBox.width : box.width
              const currentH = isCurrentlyActive ? activeBox.height : box.height
              const currentRot =
                isEditing && editId === box.id && editType === "rotate"
                  ? activeRotation
                  : box.rotation || 0

              if (showTypeset && !isDraft && hasTranslation) {
                const displayText = box.isUppercase ? box.rusText.toUpperCase() : box.rusText
                const currentFont = box.fontFamily || "v_CCFaceFront"

                const naturalH = imgRef.current?.naturalHeight || 1600
                const naturalW = imgRef.current?.naturalWidth || 1100
                const displayH = imgRef.current?.clientHeight || naturalH

                const baseSize = box.fontSize || Math.max(11, Math.min(16, Math.round(11 + currentH * 24)))
                const masterFontSize = Math.round(baseSize * (naturalH / 1200))

                const masterBoxPixelW = currentW * naturalW
                const masterBoxPixelH = currentH * naturalH

                if (!previewCanvas && typeof document !== "undefined") {
                  previewCanvas = document.createElement("canvas")
                }
                const ctx = previewCanvas?.getContext("2d")

                let screenLines: string[] = []
                let masterActualFontSize = masterFontSize
                let masterLineHeight = Math.round(masterFontSize * 1.15)

                if (ctx) {
                  const res = layoutBubbleTextLines(
                    ctx,
                    displayText,
                    masterBoxPixelW,
                    masterBoxPixelH,
                    masterFontSize,
                    currentFont,
                    box.shape || "rect",
                    padMode,
                    box.isBold,
                    box.isItalic
                  )
                  screenLines = res.lines
                  masterActualFontSize = res.actualFontSize
                  masterLineHeight = res.lineHeight
                }

                const scale = displayH / naturalH
                const finalScreenFontSize = Math.max(7, Math.round(masterActualFontSize * scale))
                const finalScreenLineHeight = Math.max(8, Math.round(masterLineHeight * scale))

                return (
                  <div
                    key={box.id}
                    id={`box-${box.id}`}
                    onMouseDown={(e) => handleBoxMouseDown(e, box as TextBlock, "move")}
                    className={[
                      "group absolute flex flex-col items-center justify-center select-none cursor-move",
                      "bg-transparent text-black",
                      box.isBold ? "font-bold" : "font-normal",
                      box.isItalic ? "italic" : "not-italic",
                      box.hasStroke ? "manga-text-stroke" : "",
                      isSelected ? "z-20" : "z-10",
                      !isEllipse &&
                        (isSelected
                          ? "outline outline-2 outline-dashed outline-amber-400 bg-indigo-500/10"
                          : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-slate-400/70"),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: `${currentX * 100}%`,
                      top: `${currentY * 100}%`,
                      width: `${currentW * 100}%`,
                      height: `${currentH * 100}%`,
                      transform: `rotate(${currentRot}deg)`,
                      transformOrigin: "center center",
                      fontFamily: `'${currentFont}', sans-serif`,
                      fontSize: `${finalScreenFontSize}px`,
                      lineHeight: `${finalScreenLineHeight}px`,
                    }}
                  >
                    {isEllipse && (
                      <svg
                        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                      >
                        <ellipse
                          cx="50"
                          cy="50"
                          rx="49"
                          ry="49"
                          fill={isSelected ? "rgba(99, 102, 241, 0.1)" : "none"}
                          stroke={isSelected ? "#f59e0b" : "currentColor"}
                          strokeWidth={isSelected ? "2" : "1.2"}
                          strokeDasharray={isSelected ? "4 3" : "3 3"}
                          vectorEffect="non-scaling-stroke"
                          className={isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-70 text-slate-400"}
                        />
                      </svg>
                    )}

                    <div className="relative z-10 flex flex-col items-center justify-center w-full pointer-events-none text-center">
                      {screenLines.map((line, lIdx) => (
                        <span key={lIdx} className="block w-full text-center whitespace-nowrap">
                          {line}
                        </span>
                      ))}
                    </div>

                    {isSelected && renderResizeAndRotateControls(box as TextBlock, currentRot)}
                  </div>
                )
              }

              return (
                <div
                  id={`box-${box.id}`}
                  key={box.id}
                  onMouseDown={(e) => {
                    if (isDraft) return
                    handleBoxMouseDown(e, box as TextBlock, "move")
                  }}
                  className={[
                    "group absolute flex items-start justify-start",
                    isSelected ? "z-10 cursor-move" : "cursor-pointer",
                    !isEllipse && [
                      "border-2 rounded-sm transition-colors",
                      isDraft
                        ? "border-indigo-400 bg-indigo-400/20"
                        : isSelected
                          ? "border-amber-400 bg-amber-400/20"
                          : "border-indigo-500/80 bg-indigo-500/10 hover:bg-indigo-500/20",
                    ].join(" "),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: `${currentX * 100}%`,
                    top: `${currentY * 100}%`,
                    width: `${currentW * 100}%`,
                    height: `${currentH * 100}%`,
                    transform: `rotate(${currentRot}deg)`,
                    transformOrigin: "center center",
                  }}
                >
                  {isEllipse && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <ellipse
                        cx="50"
                        cy="50"
                        rx="49"
                        ry="49"
                        fill={
                          isDraft
                            ? "rgba(129, 140, 248, 0.2)"
                            : isSelected
                              ? "rgba(245, 158, 11, 0.2)"
                              : "rgba(99, 102, 241, 0.1)"
                        }
                        stroke={isDraft ? "#818cf8" : isSelected ? "#f59e0b" : "#6366f1"}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        className="transition-colors group-hover:stroke-indigo-400"
                      />
                    </svg>
                  )}

                  {!isDraft && (
                    <>
                      <span className="relative z-10 m-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-bold leading-none text-indigo-300 pointer-events-none">
                        {index + 1}
                      </span>

                      {isSelected && renderResizeAndRotateControls(box as TextBlock, currentRot)}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {imageSrc && (
        <footer className="flex items-center justify-between border-t border-slate-800 px-5 py-2 text-xs text-slate-400 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <MousePointerSquareDashed className="h-3.5 w-3.5 text-slate-500" />
            <span>Resize from 8 points. Drag top circle to rotate.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>Бабл:</span>
            <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-indigo-300 border border-slate-700">
              {BUBBLE_HOTKEYS.toggleShape.label}
            </kbd> Oval
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
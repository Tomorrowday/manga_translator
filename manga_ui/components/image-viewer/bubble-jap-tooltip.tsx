// manga_ui/components/image-viewer/bubble-jap-tooltip.tsx
// Плашка японского оригинала под Yomitan / Rikaikun с автоподбором стороны вокруг бабла

"use client"

import type React from "react"
import type { TextBlock } from "@/lib/types"

export interface BubbleJapTooltipProps {
  box: TextBlock
  index: number
  isSelected: boolean
  showJapOverlay: boolean
  isDraft: boolean
  isInlineEditing: boolean
  currentX: number
  currentY: number
  currentW: number
  currentH: number
  currentRot: number
  onSelect: (id: string) => void
}

export function BubbleJapTooltip({
  box,
  index,
  isSelected,
  showJapOverlay,
  isDraft,
  isInlineEditing,
  currentX,
  currentY,
  currentW,
  currentH,
  currentRot,
  onSelect,
}: BubbleJapTooltipProps) {
  const hasJapText = Boolean(box.japText && box.japText.trim())
  if (!showJapOverlay || isDraft || isInlineEditing || !hasJapText) return null

  // Оптимальное положение плашки, чтобы не вылезать за края скана и не перекрывать бабл
  const spaceRight = 1 - (currentX + currentW)
  const spaceLeft = currentX
  const spaceBottom = 1 - (currentY + currentH)

  let positionClasses = ""
  if (spaceRight >= 0.22) {
    positionClasses = "left-full ml-2 top-0"
  } else if (spaceLeft >= 0.22) {
    positionClasses = "right-full mr-2 top-0"
  } else if (spaceBottom >= 0.14) {
    positionClasses = "top-full mt-2 left-1/2 -translate-x-1/2"
  } else {
    positionClasses = "bottom-full mb-2 left-1/2 -translate-x-1/2"
  }

  return (
    <div
      lang="ja"
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect(box.id)
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(box.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
      }}
      className={[
        "absolute z-40 min-w-[140px] max-w-[260px] rounded-lg px-2.5 py-1.5",
        "bg-slate-950/95 text-slate-100 shadow-xl backdrop-blur-md",
        "select-text cursor-text pointer-events-auto whitespace-pre-wrap break-words",
        isSelected
          ? "border-2 border-amber-400/90 ring-2 ring-amber-400/25"
          : "border border-indigo-500/60 hover:border-indigo-400",
        positionClasses,
      ].join(" ")}
      style={{
        fontSize: "17px",
        lineHeight: 1.4,
        fontFamily: "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Noto Sans JP', sans-serif",
        fontWeight: 500,
        fontStyle: "normal",
        textShadow: "none",
        transform: Math.abs(currentRot) >= 0.5 ? `rotate(${-currentRot}deg)` : undefined,
      }}
      title="Наведите курсор или выделите иероглифы для перевода через Yomitan / Rikaikun"
    >
      <div className="mb-0.5 flex items-center justify-between gap-2 border-b border-slate-800/80 pb-0.5 text-[10px] font-sans font-bold text-indigo-300 select-none">
        <span>#{index + 1} JP</span>
        {box.speaker && <span className="truncate text-emerald-400 font-medium">{box.speaker}</span>}
      </div>
      <div className="select-text cursor-text tracking-wide">{box.japText}</div>
    </div>
  )
}

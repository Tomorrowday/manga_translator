// manga_ui/components/image-viewer/bubble-color-frame-view.tsx
// Режим разметки: цветная рамка бабла по классу (речь, мысли, текст, звук) с бейджем и точками трансформации

"use client"

import type React from "react"
import type { TextBlock } from "@/lib/types"
import type { EditAction } from "@/hooks/use-box-transform"
import { CLASS_THEMES, type BubbleClassId } from "./bubble-constants"

export interface BubbleColorFrameViewProps {
  box: TextBlock
  index: number
  isDraft: boolean
  isEllipse: boolean
  isSelected: boolean
  showJapOverlay: boolean
  currentX: number
  currentY: number
  currentW: number
  currentH: number
  currentRot: number
  onMouseDown: (e: React.MouseEvent, action: EditAction) => void
  onDoubleClick: (e: React.MouseEvent) => void
  handles: React.ReactNode
  japTooltip: React.ReactNode
}

export function BubbleColorFrameView({
  box,
  index,
  isDraft,
  isEllipse,
  isSelected,
  showJapOverlay,
  currentX,
  currentY,
  currentW,
  currentH,
  currentRot,
  onMouseDown,
  onDoubleClick,
  handles,
  japTooltip,
}: BubbleColorFrameViewProps) {
  const classId = ((box.class_id ?? 0) in CLASS_THEMES ? box.class_id ?? 0 : 0) as BubbleClassId
  const theme = CLASS_THEMES[classId]

  // Золотая рамка при выборе, но фон сохраняется от соответствующей темы
  const rectBorderClass = isDraft
    ? "border-indigo-400 bg-indigo-400/20"
    : isSelected
      ? `border-amber-400 ring-1 ring-amber-400/40 shadow-lg ${theme.bg}`
      : `${theme.border} ${theme.bg}`

  const ellipseStrokeColor = isDraft ? "#818cf8" : isSelected ? "#f59e0b" : theme.stroke
  const ellipseFillColor = isDraft ? "rgba(129, 140, 248, 0.2)" : theme.fill

  const badgeStyle = isDraft
    ? "bg-indigo-600 text-white"
    : isSelected
      ? "bg-amber-400 text-slate-950 font-black ring-1 ring-amber-300"
      : theme.badgeBg

  return (
    <div
      id={`box-${box.id}`}
      onMouseDown={(e) => {
        if (isDraft) return
        onMouseDown(e, "move")
      }}
      onDoubleClick={onDoubleClick}
      className={[
        "group absolute flex items-start justify-start select-none",
        isSelected ? "z-30 cursor-move" : showJapOverlay ? "hover:z-30 cursor-pointer z-10" : "cursor-pointer z-10",
        !isEllipse && ["border-2 rounded-sm transition-colors", rectBorderClass].join(" "),
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
            fill={ellipseFillColor}
            stroke={ellipseStrokeColor}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className="transition-colors"
          />
        </svg>
      )}

      {!isDraft && (
        <>
          <span
            className={[
              "relative z-10 m-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none pointer-events-none shadow select-none",
              badgeStyle,
            ].join(" ")}
          >
            <span>{index + 1}</span>
            <span className="opacity-90 font-mono text-[9px]">[{theme.label}]</span>
          </span>
          {handles}
          {japTooltip}
        </>
      )}
    </div>
  )
}

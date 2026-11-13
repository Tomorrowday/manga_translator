// manga_ui/components/image-viewer/bubble-typeset-view.tsx
// Режим тайпсета: текст перевода, наложенный на скан, с овальной обводкой и точками трансформации

"use client"

import type React from "react"
import type { TextBlock } from "@/lib/types"
import type { EditAction } from "@/hooks/use-box-transform"

export interface BubbleTypesetViewProps {
  box: TextBlock
  screenLines: string[]
  isEllipse: boolean
  isWhiteText: boolean
  isSelected: boolean
  showJapOverlay: boolean
  currentX: number
  currentY: number
  currentW: number
  currentH: number
  currentRot: number
  currentFont: string
  finalScreenFontSize: number
  finalScreenLineHeight: number
  onMouseDown: (e: React.MouseEvent, action: EditAction) => void
  onDoubleClick: (e: React.MouseEvent) => void
  handles: React.ReactNode
  japTooltip: React.ReactNode
}

export function BubbleTypesetView({
  box,
  screenLines,
  isEllipse,
  isWhiteText,
  isSelected,
  showJapOverlay,
  currentX,
  currentY,
  currentW,
  currentH,
  currentRot,
  currentFont,
  finalScreenFontSize,
  finalScreenLineHeight,
  onMouseDown,
  onDoubleClick,
  handles,
  japTooltip,
}: BubbleTypesetViewProps) {
  return (
    <div
      id={`box-${box.id}`}
      onMouseDown={(e) => onMouseDown(e, "move")}
      onDoubleClick={onDoubleClick}
      className={[
        "group absolute flex flex-col items-center justify-center select-none cursor-move bg-transparent",
        isWhiteText ? "text-white" : "text-black",
        box.isBold ? "font-bold" : "font-normal",
        box.isItalic ? "italic" : "not-italic",
        box.hasStroke
          ? isWhiteText
            ? "manga-text-stroke-black"
            : "manga-text-stroke"
          : "",
        isSelected ? "z-30" : showJapOverlay ? "hover:z-30 z-10" : "z-10",
        !isEllipse &&
          (isSelected
            ? "outline outline-2 outline-amber-400"
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
      title="Двойной клик — редактировать текст прямо на скане"
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
            fill="none"
            stroke={isSelected ? "#f59e0b" : "currentColor"}
            strokeWidth={isSelected ? "2" : "1.2"}
            strokeDasharray={isSelected ? "none" : "3 3"}
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

      {handles}
      {japTooltip}
    </div>
  )
}

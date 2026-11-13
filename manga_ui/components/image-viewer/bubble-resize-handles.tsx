// manga_ui/components/image-viewer/bubble-resize-handles.tsx
// Рычажок вращения, 8 точек ресайза и индикатор градусов вокруг выделенного бабла

"use client"

import type React from "react"
import { RotateCw } from "lucide-react"
import type { EditAction } from "@/hooks/use-box-transform"
import { RESIZE_HANDLES } from "./bubble-constants"

export interface BubbleResizeHandlesProps {
  isSelected: boolean
  isInlineEditing?: boolean
  currentRot: number
  isEditingCurrent: boolean
  editType: EditAction | null
  onStartAction: (e: React.MouseEvent, action: EditAction) => void
}

export function BubbleResizeHandles({
  isSelected,
  isInlineEditing = false,
  currentRot,
  isEditingCurrent,
  editType,
  onStartAction,
}: BubbleResizeHandlesProps) {
  if (!isSelected || isInlineEditing) return null

  return (
    <>
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-40">
        <div
          onMouseDown={(e) => onStartAction(e, "rotate")}
          className="h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-amber-400 shadow-md cursor-grab active:cursor-grabbing hover:scale-125 transition-transform flex items-center justify-center"
          title={`Повернуть бабл (${Math.round(currentRot)}°)`}
        >
          <RotateCw className="h-2 w-2 text-slate-900" />
        </div>
        <div className="h-3 w-[1.5px] bg-amber-400 shadow-sm" />
      </div>

      {RESIZE_HANDLES.map(({ dir, cursor, className }) => (
        <div
          key={dir}
          onMouseDown={(e) => onStartAction(e, dir)}
          className={[
            "absolute z-30 h-2.5 w-2.5 rounded-sm border border-slate-900 bg-amber-400 shadow-sm transition-transform hover:scale-125",
            cursor,
            className,
          ].join(" ")}
          title={`Изменить размер (${dir.toUpperCase()})`}
        />
      ))}

      {isEditingCurrent && editType === "rotate" && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 border border-amber-500/50 shadow pointer-events-none whitespace-nowrap z-50">
          {Math.round(currentRot)}°
        </div>
      )}
    </>
  )
}

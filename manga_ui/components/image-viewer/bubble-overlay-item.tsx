"use client"

import { useState, useRef, useEffect } from "react"
import { RotateCw } from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { layoutBubbleTextLines } from "@/lib/typeset"
import type { EditAction, ResizeDirection, DrawRect } from "@/hooks/use-box-transform"

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

interface BubbleOverlayItemProps {
  box: TextBlock
  index: number
  isSelected: boolean
  showTypeset: boolean
  imgElement: HTMLImageElement | null
  isEditingCurrent: boolean
  editType: EditAction | null
  activeBox: DrawRect | null
  activeRotation: number
  onStartTransform: (e: React.MouseEvent, box: TextBlock, action: EditAction) => void
  onSelect: (id: string) => void
  onUpdate?: (id: string, patch: Partial<TextBlock>) => void
}

export function BubbleOverlayItem({
  box,
  index,
  isSelected,
  showTypeset,
  imgElement,
  isEditingCurrent,
  editType,
  activeBox,
  activeRotation,
  onStartTransform,
  onSelect,
  onUpdate,
}: BubbleOverlayItemProps) {
  const isDraft = box.id === "__draft__"
  const hasTranslation = Boolean(box.rusText && box.rusText.trim())
  const isEllipse = box.shape === "ellipse"
  const padMode = box.paddingMode || "safe"
  const isMinHyphens = box.minHyphens !== false

  const [isInlineEditing, setIsInlineEditing] = useState(false)
  const [localText, setLocalText] = useState(box.rusText || "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLocalText(box.rusText || "")
  }, [box.rusText])

  useEffect(() => {
    if (isInlineEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isInlineEditing])

  const currentX = isEditingCurrent && activeBox ? activeBox.x : box.x
  const currentY = isEditingCurrent && activeBox ? activeBox.y : box.y
  const currentW = isEditingCurrent && activeBox ? activeBox.width : box.width
  const currentH = isEditingCurrent && activeBox ? activeBox.height : box.height
  const currentRot = isEditingCurrent && editType === "rotate" ? activeRotation : box.rotation || 0

  const handleMouseDown = (e: React.MouseEvent, action: EditAction) => {
    if (isInlineEditing) return
    e.stopPropagation()
    onSelect(box.id)
    onStartTransform(e, box, action)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isDraft) return
    e.stopPropagation()
    onSelect(box.id)
    setIsInlineEditing(true)
  }

  const commitInlineEdit = () => {
    setIsInlineEditing(false)
    if (localText !== box.rusText && onUpdate) {
      onUpdate(box.id, {
        rusText: localText,
        status: localText.trim() ? "translated" : box.japText ? "ocr-done" : "new",
      })
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()

    // Ctrl+Enter или Cmd+Enter -> Сохранить и выйти
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      commitInlineEdit()
      return
    }

    // Escape -> Отменить и выйти
    if (e.key === "Escape") {
      e.preventDefault()
      setLocalText(box.rusText || "")
      setIsInlineEditing(false)
      return
    }

    // Обычный Enter создаёт перенос строки (\n)
  }

  const renderHandles = () => {
    if (!isSelected || isInlineEditing) return null
    return (
      <>
        {/* Верхний маркер вращения */}
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-40">
          <div
            onMouseDown={(e) => handleMouseDown(e, "rotate")}
            className="h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-amber-400 shadow-md cursor-grab active:cursor-grabbing hover:scale-125 transition-transform flex items-center justify-center"
            title={`Повернуть бабл (Текущий: ${Math.round(currentRot)}°)`}
          >
            <RotateCw className="h-2 w-2 text-slate-900" />
          </div>
          <div className="h-3 w-[1.5px] bg-amber-400 shadow-sm" />
        </div>

        {/* 8 точек изменения размера */}
        {RESIZE_HANDLES.map(({ dir, cursor, className }) => (
          <div
            key={dir}
            onMouseDown={(e) => handleMouseDown(e, dir)}
            className={[
              "absolute z-30 h-2.5 w-2.5 rounded-sm border border-slate-900 bg-amber-400 shadow-sm transition-transform hover:scale-125",
              cursor,
              className,
            ].join(" ")}
            title={`Изменить размер (${dir.toUpperCase()})`}
          />
        ))}

        {/* Бейдж градусов при вращении */}
        {isEditingCurrent && editType === "rotate" && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 border border-amber-500/50 shadow pointer-events-none whitespace-nowrap z-50">
            {Math.round(currentRot)}°
          </div>
        )}
      </>
    )
  }

  // Расчет шрифтов и верстки для отображения
  const naturalH = imgElement?.naturalHeight || 1600
  const naturalW = imgElement?.naturalWidth || 1100
  const displayH = imgElement?.clientHeight || naturalH
  const baseSize = box.fontSize || Math.max(11, Math.min(16, Math.round(11 + currentH * 24)))
  const masterFontSize = Math.round(baseSize * (naturalH / 1200))
  const masterBoxPixelW = currentW * naturalW
  const masterBoxPixelH = currentH * naturalH
  const currentFont = box.fontFamily || "v_CCFaceFront"

  if (!previewCanvas && typeof document !== "undefined") {
    previewCanvas = document.createElement("canvas")
  }
  const ctx = previewCanvas?.getContext("2d")

  let screenLines: string[] = []
  let masterActualFontSize = masterFontSize
  let masterLineHeight = Math.round(masterFontSize * 1.15)

  const rawDisplayText = isInlineEditing ? localText : box.rusText || ""
  const displayText = box.isUppercase ? rawDisplayText.toUpperCase() : rawDisplayText

  if (ctx && displayText.trim()) {
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
      box.isItalic,
      isMinHyphens
    )
    screenLines = res.lines
    masterActualFontSize = res.actualFontSize
    masterLineHeight = res.lineHeight
  }

  const scale = displayH / naturalH
  const finalScreenFontSize = Math.max(7, Math.round(masterActualFontSize * scale))
  const finalScreenLineHeight = Math.max(8, Math.round(masterLineHeight * scale))

  // ИНЛАЙН-РЕДАКТИРОВАНИЕ ПРЯМО НА СКАНЕ
  if (isInlineEditing) {
    return (
      <div
        id={`box-${box.id}`}
        className="absolute z-50 flex items-center justify-center"
        style={{
          left: `${currentX * 100}%`,
          top: `${currentY * 100}%`,
          width: `${currentW * 100}%`,
          height: `${currentH * 100}%`,
          transform: `rotate(${currentRot}deg)`,
          transformOrigin: "center center",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onBlur={commitInlineEdit}
          placeholder="Текст реплики..."
          className={[
            "h-full w-full resize-none p-1.5 text-center text-black outline-none border-2 border-indigo-500 rounded shadow-2xl bg-white/95 backdrop-blur-sm",
            box.isBold ? "font-bold" : "font-normal",
            box.isItalic ? "italic" : "not-italic",
          ].join(" ")}
          style={{
            fontFamily: `'${currentFont}', sans-serif`,
            fontSize: `${Math.max(10, finalScreenFontSize)}px`,
            lineHeight: `${Math.max(12, finalScreenLineHeight)}px`,
          }}
        />
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950 px-1.5 py-0.5 text-[9px] text-slate-300 border border-slate-700 pointer-events-none shadow">
          Enter: перенос | Ctrl+Enter: готово | Esc: отмена
        </div>
      </div>
    )
  }

  // РЕЖИМ 1: ПРЕДПРОСМОТР ТАЙПСЕТА (ТЕКСТ НА СКАНИРОВАНИИ)
  if (showTypeset && !isDraft && hasTranslation) {
    return (
      <div
        id={`box-${box.id}`}
        onMouseDown={(e) => handleMouseDown(e, "move")}
        onDoubleClick={handleDoubleClick}
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
        title="Двойной клик — редактировать текст прямо на скане"
      >
        {isEllipse && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
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

        {renderHandles()}
      </div>
    )
  }

  // РЕЖИМ 2: СТАНДАРТНАЯ РАЗМЕТКА РАМОК И БАБЛОВ
  return (
    <div
      id={`box-${box.id}`}
      onMouseDown={(e) => {
        if (isDraft) return
        handleMouseDown(e, "move")
      }}
      onDoubleClick={handleDoubleClick}
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
      title="Двойной клик — редактировать текст"
    >
      {isEllipse && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
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
          {renderHandles()}
        </>
      )}
    </div>
  )
}
// manga_ui/components/image-viewer/bubble-overlay-item_impl.tsx
// Наложение интерактивного бабла на скан + автопозиционируемая плашка японского оригинала под Rikaikun / Yomitan

"use client"

import React, { useState, useRef, useEffect, useMemo, memo } from "react"
import { RotateCw } from "lucide-react"
import { layoutBubbleTextLines, reflowFromManualLines } from "@/lib/typeset"
import type { EditAction, ResizeDirection } from "@/hooks/use-box-transform"
import type { BubbleOverlayItemProps } from "./bubble-overlay-item"
import type { TextBlock } from "@/lib/types"

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

const CLASS_THEMES = {
  0: {
    label: "Б",
    title: "Бабл речи",
    border: "border-emerald-500",
    bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
    stroke: "#10b981",
    fill: "rgba(16, 185, 129, 0.10)",
    badgeBg: "bg-emerald-600 text-white shadow-emerald-950/50",
  },
  1: {
    label: "М",
    title: "Мысли",
    border: "border-sky-500",
    bg: "bg-sky-500/10 hover:bg-sky-500/20",
    stroke: "#0ea5e9",
    fill: "rgba(14, 165, 233, 0.10)",
    badgeBg: "bg-sky-600 text-white shadow-sky-950/50",
  },
  2: {
    label: "Т",
    title: "Текст (Free Text)",
    border: "border-purple-500",
    bg: "bg-purple-500/10 hover:bg-purple-500/20",
    stroke: "#a855f7",
    fill: "rgba(168, 85, 247, 0.10)",
    badgeBg: "bg-purple-600 text-white shadow-purple-950/50",
  },
  3: {
    label: "З",
    title: "Звук (SFX)",
    border: "border-orange-600",
    bg: "bg-orange-600/10 hover:bg-orange-600/20",
    stroke: "#ea580c",
    fill: "rgba(234, 88, 12, 0.12)",
    badgeBg: "bg-amber-800 text-orange-200 shadow-amber-950/50 border border-orange-500/40",
  },
} as const

let previewCanvas: HTMLCanvasElement | null = null

export const BubbleOverlayItem = memo(function BubbleOverlayItem({
  box,
  index,
  isSelected,
  showTypeset,
  showJapOverlay = false,
  imgElement,
  isEditingCurrent,
  editType,
  activeBox,
  activeRotation,
  defaultFontSize = 14,
  onStartTransform,
  onSelect,
  onUpdate,
}: BubbleOverlayItemProps) {
  const isDraft = box.id === "__draft__"
  const hasTranslation = Boolean(box.rusText && box.rusText.trim())
  const hasJapText = Boolean(box.japText && box.japText.trim())
  const isEllipse = box.shape === "ellipse"
  const padMode = box.paddingMode || "safe"
  const isMinHyphens = box.minHyphens !== false
  const isWhiteText = box.textColor === "white"

  const classId = ((box.class_id ?? 0) in CLASS_THEMES ? box.class_id ?? 0 : 0) as 0 | 1 | 2 | 3
  const theme = CLASS_THEMES[classId]

  const [isInlineEditing, setIsInlineEditing] = useState(false)
  const [localText, setLocalText] = useState(box.rusText || "")
  const [imgMetrics, setImgMetrics] = useState({
    naturalW: 1100,
    naturalH: 1600,
    clientH: 1600,
  })
  const [fontsLoadedTick, setFontsLoadedTick] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshotLinesOnOpenRef = useRef<string[]>([])

  useEffect(() => {
    if (!imgElement) return

    const updateMetrics = () => {
      setImgMetrics({
        naturalW: imgElement.naturalWidth || 1100,
        naturalH: imgElement.naturalHeight || 1600,
        clientH: imgElement.clientHeight || imgElement.naturalHeight || 1600,
      })
    }

    updateMetrics()

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(imgElement)
    window.addEventListener("resize", updateMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateMetrics)
    }
  }, [imgElement])

  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        setFontsLoadedTick((t) => t + 1)
      })
    }
  }, [box.fontFamily])

  const currentX = isEditingCurrent && activeBox ? activeBox.x : box.x
  const currentY = isEditingCurrent && activeBox ? activeBox.y : box.y
  const currentW = isEditingCurrent && activeBox ? activeBox.width : box.width
  const currentH = isEditingCurrent && activeBox ? activeBox.height : box.height
  const currentRot = isEditingCurrent && editType === "rotate" ? activeRotation : box.rotation || 0

  const naturalH = imgElement?.naturalHeight || imgMetrics.naturalH
  const naturalW = imgElement?.naturalWidth || imgMetrics.naturalW
  const displayH = imgElement?.clientHeight || imgMetrics.clientH

  const baseSize = box.fontSize || defaultFontSize
  const masterFontSize = Math.round(baseSize * (naturalH / 1200))
  const masterBoxPixelW = currentW * naturalW
  const masterBoxPixelH = currentH * naturalH
  const currentFont = box.fontFamily || "v_CCFaceFront"

  if (!previewCanvas && typeof document !== "undefined") {
    previewCanvas = document.createElement("canvas")
  }

  const rawDisplayText = box.rusText || ""
  const displayText = box.isUppercase ? rawDisplayText.toUpperCase() : rawDisplayText

  const { screenLines, editableLines, masterActualFontSize, masterLineHeight } = useMemo(() => {
    const ctx = previewCanvas?.getContext("2d")
    if (!ctx || !displayText.trim()) {
      return {
        screenLines: [],
        editableLines: [],
        masterActualFontSize: masterFontSize,
        masterLineHeight: Math.round(masterFontSize * 1.15),
      }
    }

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

    let editLines = res.lines
    if (box.isUppercase && rawDisplayText.trim()) {
      const rawRes = layoutBubbleTextLines(
        ctx,
        rawDisplayText,
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
      editLines = rawRes.lines
    }

    return {
      screenLines: res.lines,
      editableLines: editLines,
      masterActualFontSize: res.actualFontSize,
      masterLineHeight: res.lineHeight,
    }
  }, [
    displayText,
    rawDisplayText,
    masterBoxPixelW,
    masterBoxPixelH,
    masterFontSize,
    currentFont,
    box.shape,
    padMode,
    box.isBold,
    box.isItalic,
    box.isUppercase,
    isMinHyphens,
    fontsLoadedTick,
  ])

  useEffect(() => {
    if (!isInlineEditing) {
      setLocalText(box.rusText || "")
    }
  }, [box.rusText, isInlineEditing])

  useEffect(() => {
    if (isInlineEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isInlineEditing])

  const scale = naturalH > 0 ? displayH / naturalH : 1
  const finalScreenFontSize = Math.max(6, Number((masterActualFontSize * scale).toFixed(2)))
  const finalScreenLineHeight = Math.max(7, Number((masterLineHeight * scale).toFixed(2)))

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
    const exactVisibleState = editableLines.length > 0 ? editableLines.join("\n") : box.rusText || ""
    snapshotLinesOnOpenRef.current = [...editableLines]
    setLocalText(exactVisibleState)
    setIsInlineEditing(true)
  }

  const computeReflowedState = (rawInput: string): { storageText: string; previewLines: string[] } => {
    const trimmed = rawInput.trim()
    if (!trimmed) return { storageText: "", previewLines: [] }

    const storageText = reflowFromManualLines(snapshotLinesOnOpenRef.current, trimmed)
    const ctx = previewCanvas?.getContext("2d")
    if (!ctx) {
      return { storageText, previewLines: storageText.split("\n") }
    }

    const res = layoutBubbleTextLines(
      ctx,
      storageText,
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

    return {
      storageText,
      previewLines: res.lines,
    }
  }

  const commitInlineEdit = () => {
    setIsInlineEditing(false)
    const trimmed = localText.trim()

    if (trimmed === snapshotLinesOnOpenRef.current.join("\n").trim()) {
      return
    }

    const { storageText } = computeReflowedState(trimmed)

    if (onUpdate) {
      const isSpeech = (box.class_id ?? 0) === 0
      const hasText = storageText.length > 0
      const patch: Partial<TextBlock> = {
        rusText: storageText,
        status: hasText ? "translated" : box.japText ? "ocr-done" : "new",
      }
      if (isSpeech && !box.shape) {
        patch.shape = hasText ? "ellipse" : "rect"
      }
      onUpdate(box.id, patch)
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()

    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      commitInlineEdit()
      return
    }

    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const ta = textareaRef.current
      if (ta) {
        e.preventDefault()
        const start = ta.selectionStart ?? localText.length
        const end = ta.selectionEnd ?? localText.length
        const before = localText.slice(0, start).trimEnd()
        const after = localText.slice(end).trimStart()

        const nextRaw = `${before}\n${after}`
        const { storageText, previewLines } = computeReflowedState(nextRaw)

        if (onUpdate) {
          onUpdate(box.id, { rusText: storageText, status: "translated" })
        }

        const nextVisible = previewLines.join("\n")
        snapshotLinesOnOpenRef.current = [...previewLines]
        setLocalText(nextVisible)

        const newCursorPos = Math.min(nextVisible.length, before.length + 1)
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
          }
        })
        return
      }
    }

    if (e.key === "Escape") {
      e.preventDefault()
      setLocalText(editableLines.length > 0 ? editableLines.join("\n") : box.rusText || "")
      setIsInlineEditing(false)
      return
    }
  }

  // Вычисление оптимального положения плашки японского текста (чтобы не вылезать за края скана и не перекрывать бабл)
  const renderJapOverlay = () => {
    if (!showJapOverlay || isDraft || isInlineEditing || !hasJapText) return null

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

  const renderHandles = () => {
    if (!isSelected || isInlineEditing) return null
    return (
      <>
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-40">
          <div
            onMouseDown={(e) => handleMouseDown(e, "rotate")}
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
            onMouseDown={(e) => handleMouseDown(e, dir)}
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

  if (isInlineEditing) {
    const editLinesCount = Math.max(2, localText.split("\n").length)
    const dynamicEditH = Math.max(
      masterBoxPixelH * scale,
      editLinesCount * (finalScreenLineHeight + 2) + 12
    )

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
        <div
          className="relative flex items-center justify-center w-full min-w-[120px]"
          style={{ height: `${dynamicEditH}px` }}
        >
          <textarea
            ref={textareaRef}
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            onBlur={commitInlineEdit}
            wrap="off"
            placeholder="Текст..."
            className={[
              "w-full h-full p-1.5 text-center outline-none border-2 border-indigo-500 rounded-md shadow-2xl backdrop-blur-md overflow-x-auto overflow-y-auto resize-none",
              isWhiteText
                ? "bg-slate-900/95 text-white placeholder:text-slate-400"
                : "bg-white/95 text-black placeholder:text-slate-500",
              box.isBold ? "font-bold" : "font-normal",
              box.isItalic ? "italic" : "not-italic",
              box.isUppercase ? "uppercase" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              fontFamily: `'${currentFont}', sans-serif`,
              fontSize: `${Math.max(11, finalScreenFontSize)}px`,
              lineHeight: `${Math.max(13, finalScreenLineHeight)}px`,
            }}
          />
        </div>
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950 px-1.5 py-0.5 text-[9px] text-slate-300 border border-slate-700 pointer-events-none shadow">
          Enter: перенос + пересчёт хвоста | Ctrl+Enter: готово | Esc: отмена
        </div>
      </div>
    )
  }

  if (showTypeset && !isDraft && hasTranslation) {
    return (
      <div
        id={`box-${box.id}`}
        onMouseDown={(e) => handleMouseDown(e, "move")}
        onDoubleClick={handleDoubleClick}
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

        {renderHandles()}
        {renderJapOverlay()}
      </div>
    )
  }

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
        handleMouseDown(e, "move")
      }}
      onDoubleClick={handleDoubleClick}
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
      title={`[${theme.title}] — Двойной клик для редактирования текста`}
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
          {renderHandles()}
          {renderJapOverlay()}
        </>
      )}
    </div>
  )
})
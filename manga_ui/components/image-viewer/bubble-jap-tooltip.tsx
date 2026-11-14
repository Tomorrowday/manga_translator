// manga_ui/components/image-viewer/bubble-jap-tooltip.tsx
// Интерактивная плашка японского оригинала на скане:
// - без мешающего браузерного title
// - свободное перетаскивание (Drag) за шапку с сохранением смещения japOffset
// - прямое редактирование японского текста (по кнопке карандаша или двойному клику по тексту)
// - встроенный морфологический разбор и локальный словарь (Warodai + JMdict + Глоссарий тайтла)

"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { GripHorizontal, Pencil, Check, X, RotateCcw } from "lucide-react"
import type { TextBlock } from "@/lib/types"
import {
  analyzeBubbleJapText,
  DICT_GLOSSARY_UPDATED_EVENT,
  type TokenSpan,
} from "@/lib/api/dictionary"
import { TokenizedBubbleText } from "./tokenized-bubble-text"

export interface BubbleJapTooltipProps {
  box: TextBlock
  index: number
  titleId?: number | null
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
  onUpdate?: (id: string, patch: Partial<TextBlock>) => void
}

export function BubbleJapTooltip({
  box,
  index,
  titleId,
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
  onUpdate,
}: BubbleJapTooltipProps) {
  const [isEditingJap, setIsEditingJap] = useState(false)
  const [draftJap, setDraftJap] = useState(box.japText || "")
  const [isDragging, setIsDragging] = useState(false)
  const [liveOffset, setLiveOffset] = useState<{ x: number; y: number } | null>(null)
  const [tokens, setTokens] = useState<TokenSpan[] | null>(null)
  const [glossaryTick, setGlossaryTick] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dragSessionRef = useRef<{
    startMouseX: number
    startMouseY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)

  // Синхронизируем локальный черновик при внешнем обновлении japText (OCR / Undo / Redo)
  useEffect(() => {
    if (!isEditingJap) {
      setDraftJap(box.japText || "")
    }
  }, [box.japText, isEditingJap])

  // Подписка на глобальное событие обновления глоссария тайтла
  useEffect(() => {
    const handleGlossaryUpdated = () => setGlossaryTick((t) => t + 1)
    window.addEventListener(DICT_GLOSSARY_UPDATED_EVENT, handleGlossaryUpdated)
    return () => window.removeEventListener(DICT_GLOSSARY_UPDATED_EVENT, handleGlossaryUpdated)
  }, [])

  // Запрос морфологического разбора и словарных статей при показе плашки JP
  useEffect(() => {
    const raw = (box.japText || "").trim()
    if (!showJapOverlay || isDraft || !raw) {
      setTokens(null)
      return
    }

    let cancelled = false
    analyzeBubbleJapText(raw, titleId)
      .then((res) => {
        if (!cancelled) setTokens(res)
      })
      .catch(() => {
        if (!cancelled) setTokens(null)
      })

    return () => {
      cancelled = true
    }
  }, [showJapOverlay, isDraft, box.japText, titleId, glossaryTick])

  // Автофокус и установка курсора в конец при открытии редактора
  useEffect(() => {
    if (isEditingJap && textareaRef.current) {
      const ta = textareaRef.current
      ta.focus()
      const len = ta.value.length
      ta.setSelectionRange(len, len)
    }
  }, [isEditingJap])

  const savedOffset = box.japOffset ?? { x: 0, y: 0 }
  const activeOffset = liveOffset ?? savedOffset
  const hasCustomOffset = Math.abs(activeOffset.x) > 1 || Math.abs(activeOffset.y) > 1

  // Обработка глобального перетаскивания плашки за шапку
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current
      if (!session) return

      const rawDx = e.clientX - session.startMouseX
      const rawDy = e.clientY - session.startMouseY

      setLiveOffset({
        x: Math.round(session.startOffsetX + rawDx),
        y: Math.round(session.startOffsetY + rawDy),
      })
    }

    const handleMouseUp = (e: MouseEvent) => {
      const session = dragSessionRef.current
      dragSessionRef.current = null
      setIsDragging(false)

      if (!session) return
      const finalX = Math.round(session.startOffsetX + (e.clientX - session.startMouseX))
      const finalY = Math.round(session.startOffsetY + (e.clientY - session.startMouseY))

      setLiveOffset(null)
      if (Math.abs(finalX - session.startOffsetX) > 1 || Math.abs(finalY - session.startOffsetY) > 1) {
        onUpdate?.(box.id, { japOffset: { x: finalX, y: finalY } })
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, box.id, onUpdate])

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    onSelect(box.id)

    dragSessionRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startOffsetX: savedOffset.x,
      startOffsetY: savedOffset.y,
    }
    setLiveOffset(savedOffset)
    setIsDragging(true)
  }

  const handleResetOffset = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLiveOffset(null)
    onUpdate?.(box.id, { japOffset: { x: 0, y: 0 } })
  }

  const startEditingJap = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    onSelect(box.id)
    setDraftJap(box.japText || "")
    setIsEditingJap(true)
  }

  const commitJapEdit = useCallback(() => {
    setIsEditingJap(false)
    const trimmed = draftJap.trim()
    const prevTrimmed = (box.japText || "").trim()
    if (trimmed === prevTrimmed) return

    const nextStatus =
      box.status === "translated" || Boolean(box.rusText && box.rusText.trim())
        ? "translated"
        : trimmed
          ? "ocr-done"
          : "new"

    onUpdate?.(box.id, {
      japText: trimmed,
      status: nextStatus,
    })
  }, [draftJap, box.id, box.japText, box.rusText, box.status, onUpdate])

  const cancelJapEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setDraftJap(box.japText || "")
    setIsEditingJap(false)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      commitJapEdit()
      return
    }

    if (e.key === "Escape") {
      e.preventDefault()
      setDraftJap(box.japText || "")
      setIsEditingJap(false)
    }
  }

  const hasJapText = Boolean(box.japText && box.japText.trim())
  if (!showJapOverlay || isDraft || isInlineEditing || (!hasJapText && !isEditingJap)) return null

  // Автоподбор базовой стороны вокруг бабла
  const spaceRight = 1 - (currentX + currentW)
  const spaceLeft = currentX
  const spaceBottom = 1 - (currentY + currentH)

  let positionClasses = ""
  let baseTranslate = ""
  if (spaceRight >= 0.22) {
    positionClasses = "left-full ml-2 top-0"
  } else if (spaceLeft >= 0.22) {
    positionClasses = "right-full mr-2 top-0"
  } else if (spaceBottom >= 0.14) {
    positionClasses = "top-full mt-2 left-1/2"
    baseTranslate = "translateX(-50%)"
  } else {
    positionClasses = "bottom-full mb-2 left-1/2"
    baseTranslate = "translateX(-50%)"
  }

  const transformParts: string[] = []
  if (baseTranslate) transformParts.push(baseTranslate)
  if (Math.abs(currentRot) >= 0.5) transformParts.push(`rotate(${-currentRot}deg)`)
  if (activeOffset.x !== 0 || activeOffset.y !== 0) {
    transformParts.push(`translate3d(${activeOffset.x}px, ${activeOffset.y}px, 0)`)
  }
  const combinedTransform = transformParts.length > 0 ? transformParts.join(" ") : undefined

  const editRows = Math.min(8, Math.max(2, draftJap.split(/\r?\n/).length))

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
        "absolute min-w-[160px] max-w-[280px] rounded-lg px-2.5 py-1.5",
        "bg-slate-950/95 text-slate-100 shadow-xl backdrop-blur-md",
        "pointer-events-auto whitespace-pre-wrap break-words",
        isDragging || isEditingJap ? "z-50" : "z-40",
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
        transform: combinedTransform,
      }}
    >
      {/* Шапка плашки — зона перетаскивания (Drag Handle) и быстрых кнопок */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={handleResetOffset}
        className={[
          "mb-1 flex items-center justify-between gap-1.5 border-b border-slate-800/80 pb-1 text-[10px] font-sans font-bold text-indigo-300 select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        ].join(" ")}
      >
        <div className="flex items-center gap-1 min-w-0">
          <GripHorizontal className="h-3 w-3 shrink-0 text-slate-500" />
          <span className="shrink-0">#{index + 1} JP</span>
          {box.speaker && (
            <span className="truncate text-emerald-400 font-medium ml-1">{box.speaker}</span>
          )}
        </div>

        <div
          className="flex items-center gap-0.5 shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {hasCustomOffset && (
            <button
              type="button"
              onClick={handleResetOffset}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-amber-300 transition-colors"
              aria-label="Сбросить позицию"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}

          {!isEditingJap ? (
            <button
              type="button"
              onClick={startEditingJap}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-indigo-300 transition-colors"
              aria-label="Редактировать японский текст"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  commitJapEdit()
                }}
                className="rounded p-0.5 text-emerald-400 hover:bg-emerald-950/80 hover:text-emerald-200 transition-colors"
                aria-label="Сохранить"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  cancelJapEdit(e)
                }}
                className="rounded p-0.5 text-rose-400 hover:bg-rose-950/80 hover:text-rose-200 transition-colors"
                aria-label="Отменить"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Тело плашки: интерактивный токенизированный текст со словарём ИЛИ режим редактирования */}
      {!isEditingJap ? (
        <TokenizedBubbleText
          japText={box.japText || ""}
          tokens={tokens}
          titleId={titleId}
          onStartEdit={startEditingJap}
          onSetSpeaker={(speakerName) => onUpdate?.(box.id, { speaker: speakerName })}
        />
      ) : (
        <div className="space-y-1">
          <textarea
            ref={textareaRef}
            value={draftJap}
            rows={editRows}
            onChange={(e) => setDraftJap(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            onBlur={commitJapEdit}
            className="w-full min-w-[180px] resize-y rounded border border-indigo-500/80 bg-slate-900 px-1.5 py-1 text-[16px] leading-snug text-white outline-none focus:ring-1 focus:ring-indigo-400"
            style={{
              fontFamily: "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Noto Sans JP', sans-serif",
            }}
          />
          <div className="text-[9px] font-sans text-slate-400 select-none flex justify-between">
            <span>Enter — сохр.</span>
            <span>Shift+Enter — строка</span>
            <span>Esc — отмена</span>
          </div>
        </div>
      )}
    </div>
  )
}

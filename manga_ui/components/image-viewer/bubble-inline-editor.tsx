// manga_ui/components/image-viewer/bubble-inline-editor.tsx
// Инлайн-редактор текста прямо на скане: Enter — нативный перенос, Ctrl+Enter — готово, Esc — отмена

"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import type { TextBlock } from "@/lib/types"
import {
  reflowFromManualLines,
  hasManualLineBreaks,
  stripForcedSingleLineMarker,
  FORCED_SINGLE_LINE_MARKER,
} from "@/lib/typeset"
import type { ReflowOptions } from "@/lib/typeset"
import type { BubbleReflowedState } from "./use-bubble-screen-layout"

export interface BubbleInlineEditorProps {
  box: TextBlock
  editableLines: string[]
  currentX: number
  currentY: number
  currentW: number
  currentH: number
  currentRot: number
  currentFont: string
  isWhiteText: boolean
  finalScreenFontSize: number
  finalScreenLineHeight: number
  masterBoxPixelH: number
  screenScale: number
  computeReflowedState: (
    snapshotLines: string[],
    rawInput: string,
    options?: ReflowOptions
  ) => BubbleReflowedState
  onUpdate?: (id: string, patch: Partial<TextBlock>) => void
  onClose: () => void
}

export function BubbleInlineEditor({
  box,
  editableLines,
  currentX,
  currentY,
  currentW,
  currentH,
  currentRot,
  currentFont,
  isWhiteText,
  finalScreenFontSize,
  finalScreenLineHeight,
  masterBoxPixelH,
  screenScale,
  computeReflowedState,
  onUpdate,
  onClose,
}: BubbleInlineEditorProps) {
  const [localText, setLocalText] = useState(() =>
    editableLines.length > 0
      ? editableLines.join("\n")
      : stripForcedSingleLineMarker(box.rusText)
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshotLinesOnOpenRef = useRef<string[]>([...editableLines])
  const editableLinesRef = useRef<string[]>(editableLines)
  const lastEmittedStorageRef = useRef<string | null>(null)
  const originalStorageRef = useRef<string>(box.rusText || "")
  const isCancellingRef = useRef(false)
  const hasCommittedRef = useRef(false)
  // Был ли блок ручным до правки и менял ли пользователь разбивку строк.
  const wasManualBeforeEditRef = useRef(hasManualLineBreaks(box.rusText))
  const hadForcedSingleLineRef = useRef(Boolean(box.rusText?.includes(FORCED_SINGLE_LINE_MARKER)))
  const userTouchedBreaksRef = useRef(false)
  editableLinesRef.current = editableLines

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.focus()
    const len = ta.value.length
    ta.setSelectionRange(len, len)
  }, [])

  // Синхронизация при внешнем изменении текста бабла (например, после Undo / Ctrl+Z)
  useEffect(() => {
    // Не перетираем то, что пользователь только что набрал самим же onChange.
    if (box.rusText === lastEmittedStorageRef.current) return
    const lines = editableLinesRef.current
    setLocalText(
      lines.length > 0 ? lines.join("\n") : stripForcedSingleLineMarker(box.rusText)
    )
    snapshotLinesOnOpenRef.current = [...lines]
    wasManualBeforeEditRef.current = hasManualLineBreaks(box.rusText)
    hadForcedSingleLineRef.current = Boolean(box.rusText?.includes(FORCED_SINGLE_LINE_MARKER))
    userTouchedBreaksRef.current = false
  }, [box.rusText])

  const reflowOptions = (): ReflowOptions => ({
    wasManualBeforeEdit: wasManualBeforeEditRef.current,
    hasUserModifiedLineBreaks: userTouchedBreaksRef.current,
    hadForcedSingleLine: hadForcedSingleLineRef.current,
  })

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = e.target.value
    setLocalText(nextText)

    if (nextText.split(/\r?\n/).length !== snapshotLinesOnOpenRef.current.length) {
      userTouchedBreaksRef.current = true
    }

    if (!onUpdate) return

    const storageText = reflowFromManualLines(
      snapshotLinesOnOpenRef.current,
      nextText,
      reflowOptions()
    )
    lastEmittedStorageRef.current = storageText

    const hasText = storageText.length > 0
    const patch: Partial<TextBlock> = {
      rusText: storageText,
      status: hasText ? "translated" : box.japText ? "ocr-done" : "new",
    }
    onUpdate(box.id, patch)
  }

  const commitInlineEdit = () => {
    if (isCancellingRef.current || hasCommittedRef.current) return
    hasCommittedRef.current = true
    onClose()
    const trimmed = localText.trim()

    if (trimmed === snapshotLinesOnOpenRef.current.join("\n").trim()) {
      return
    }

    const { storageText } = computeReflowedState(
      snapshotLinesOnOpenRef.current,
      trimmed,
      reflowOptions()
    )

    if (onUpdate) {
      const isSpeech = (box.class_id ?? 0) === 0
      const needsShape = isSpeech && !box.shape
      if (storageText === lastEmittedStorageRef.current && !needsShape) {
        return
      }
      const hasText = storageText.length > 0
      const patch: Partial<TextBlock> = {
        rusText: storageText,
        status: hasText ? "translated" : box.japText ? "ocr-done" : "new",
      }
      if (needsShape) {
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

    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      userTouchedBreaksRef.current = true
    }

    if (e.key === "Escape") {
      e.preventDefault()
      isCancellingRef.current = true
      setLocalText(
        editableLines.length > 0
          ? editableLines.join("\n")
          : stripForcedSingleLineMarker(box.rusText)
      )
      if (onUpdate && box.rusText !== originalStorageRef.current) {
        onUpdate(box.id, {
          rusText: originalStorageRef.current,
          status: originalStorageRef.current.trim()
            ? "translated"
            : box.japText
              ? "ocr-done"
              : "new",
        })
      }
      onClose()
      return
    }
  }

  const editLinesCount = Math.max(2, localText.split("\n").length)
  const dynamicEditH = Math.max(
    masterBoxPixelH * screenScale,
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
          onChange={handleTextareaChange}
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
        Enter: перенос строки | Ctrl+Enter: готово | Esc: отмена
      </div>
    </div>
  )
}

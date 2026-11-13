// manga_ui/components/image-viewer/bubble-inline-editor.tsx
// Инлайн-редактор текста прямо на скане: Enter — перенос с пересчётом хвоста, Ctrl+Enter — готово, Esc — отмена

"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import type { TextBlock } from "@/lib/types"
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
  computeReflowedState: (snapshotLines: string[], rawInput: string) => BubbleReflowedState
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
    editableLines.length > 0 ? editableLines.join("\n") : box.rusText || ""
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshotLinesOnOpenRef = useRef<string[]>([...editableLines])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const commitInlineEdit = () => {
    onClose()
    const trimmed = localText.trim()

    if (trimmed === snapshotLinesOnOpenRef.current.join("\n").trim()) {
      return
    }

    const { storageText } = computeReflowedState(snapshotLinesOnOpenRef.current, trimmed)

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
        const { storageText, previewLines } = computeReflowedState(snapshotLinesOnOpenRef.current, nextRaw)

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

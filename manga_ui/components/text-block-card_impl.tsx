// manga_ui/components/text-block-card_impl.tsx
// Карточка текстового блока: шапка вынесена в <BlockCardHeader />, логика русского поля — в useCardRusEditor

"use client"

import { useRef, useEffect, memo } from "react"
import { WrapText } from "lucide-react"
import { reflowFromManualLines } from "@/lib/typeset"
import { BubbleStyleControls } from "@/components/text-block-card/bubble-style-controls"
import { BlockCardHeader } from "@/components/text-block-card/block-card-header"
import { useCardRusEditor } from "@/components/text-block-card/use-card-rus-editor"
import type { TextBlockCardProps } from "./text-block-card"

export const TextBlockCard = memo(function TextBlockCard({
  block,
  index,
  pageId,
  defaultFontSize = 14,
  autoOvalBubble = true,
  isSelected,
  onSelect,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onSpotClean,
}: TextBlockCardProps) {
  const cardRef = useRef<HTMLElement>(null)

  const {
    localRusText,
    setLocalRusText,
    rusTextareaRef,
    setIsFocusedRus,
    renderedLines,
    snapshotLinesRef,
    saveStorageTextToBlock,
    handleRusKeyDown,
    handleClearManualBreaks,
    hasManualNewlines,
    rusRows,
  } = useCardRusEditor({ block, defaultFontSize, autoOvalBubble, onChange })

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "auto", block: "nearest" })
    }
  }, [isSelected])

  return (
    <article
      ref={cardRef}
      onClick={onSelect}
      className={[
        "cursor-pointer rounded-lg border bg-slate-800/60 p-2.5 transition-colors",
        isSelected ? "border-amber-400/80 ring-1 ring-amber-400/40" : "border-slate-700/80 hover:border-slate-600",
      ].join(" ")}
    >
      <BlockCardHeader
        block={block}
        index={index}
        pageId={pageId}
        autoOvalBubble={autoOvalBubble}
        onChange={onChange}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onSpotClean={onSpotClean}
      />

      <div className="mt-2 space-y-1.5">
        <div>
          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Japanese</span>
          <textarea
            value={block.japText}
            onChange={(e) => onChange({ japText: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Японский текст…"
            rows={1}
            className="w-full min-h-[30px] resize-y rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">Russian</span>
            {hasManualNewlines && (
              <button
                type="button"
                onClick={handleClearManualBreaks}
                className="flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] text-amber-300/90 hover:bg-amber-950/50 hover:text-amber-200 transition-colors"
                title="Сбросить все ручные переносы строк (вернуть полный автоперенос)"
              >
                <WrapText className="h-2.5 w-2.5" />
                <span>Авто-баланс</span>
              </button>
            )}
          </div>
          <textarea
            ref={rusTextareaRef}
            value={localRusText}
            onFocus={() => {
              setIsFocusedRus(true)
              snapshotLinesRef.current = [...renderedLines]
            }}
            onBlur={() => {
              setIsFocusedRus(false)
              if (localRusText.trim() !== snapshotLinesRef.current.join("\n").trim()) {
                const storageText = reflowFromManualLines(snapshotLinesRef.current, localRusText.trim())
                saveStorageTextToBlock(storageText)
              }
            }}
            onChange={(e) => {
              setLocalRusText(e.target.value)
            }}
            onKeyDown={handleRusKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="Перевод на русский…"
            rows={rusRows}
            className="w-full min-h-[30px] resize-y rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <BubbleStyleControls block={block} defaultFontSize={defaultFontSize} onChange={onChange} />
    </article>
  )
})

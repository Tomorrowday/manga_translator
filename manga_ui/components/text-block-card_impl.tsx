// manga_ui/components/text-block-card_impl.tsx
// Карточка текстового блока: шапка вынесена в <BlockCardHeader />, логика русского поля — в useCardRusEditor,
// японское поле поддерживает интерактивный словарь TokenizedBubbleText и быстрое редактирование

"use client"

import { useState, useRef, useEffect, memo } from "react"
import { WrapText, Languages, Pencil } from "lucide-react"
import {
  analyzeBubbleJapText,
  DICT_GLOSSARY_UPDATED_EVENT,
  type TokenSpan,
} from "@/lib/api/dictionary"
import { TokenizedBubbleText } from "@/components/image-viewer/tokenized-bubble-text"
import { BubbleStyleControls } from "@/components/text-block-card/bubble-style-controls"
import { BlockCardHeader } from "@/components/text-block-card/block-card-header"
import { useCardRusEditor } from "@/components/text-block-card/use-card-rus-editor"
import type { TextBlockCardProps } from "./text-block-card"

export const TextBlockCard = memo(function TextBlockCard({
  block,
  index,
  pageId,
  titleId,
  showJapOverlay = false,
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
  const [localDictMode, setLocalDictMode] = useState(false)
  const [isEditingJapField, setIsEditingJapField] = useState(false)
  const [tokens, setTokens] = useState<TokenSpan[] | null>(null)
  const [glossaryTick, setGlossaryTick] = useState(0)

  const isDictActive = (showJapOverlay || localDictMode) && !isEditingJapField && Boolean(block.japText?.trim())

  const {
    localRusText,
    rusTextareaRef,
    setIsFocusedRus,
    snapshotLinesRef,
    saveStorageTextToBlock,
    beginRusEditSession,
    buildRusStorageText,
    handleRusKeyDown,
    handleRusTextChange,
    handleClearManualBreaks,
    hasManualNewlines,
    rusRows,
  } = useCardRusEditor({ block, defaultFontSize, autoOvalBubble, onChange })

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "auto", block: "nearest" })
    }
  }, [isSelected])

  useEffect(() => {
    const onGlossaryUpdate = () => setGlossaryTick((t) => t + 1)
    window.addEventListener(DICT_GLOSSARY_UPDATED_EVENT, onGlossaryUpdate)
    return () => window.removeEventListener(DICT_GLOSSARY_UPDATED_EVENT, onGlossaryUpdate)
  }, [])

  useEffect(() => {
    const raw = (block.japText || "").trim()
    if (!isDictActive || !raw) {
      return
    }
    let cancelled = false
    analyzeBubbleJapText(raw, titleId).then((res) => {
      if (!cancelled) setTokens(res)
    })
    return () => {
      cancelled = true
    }
  }, [isDictActive, block.japText, titleId, glossaryTick])

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
          <div className="flex items-center justify-between mb-0.5">
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Japanese
            </span>
            {block.japText?.trim() && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isDictActive) {
                    setIsEditingJapField(true)
                  } else {
                    setIsEditingJapField(false)
                    setLocalDictMode((prev) => !prev)
                  }
                }}
                className={[
                  "flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-medium transition-colors",
                  isDictActive
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                ].join(" ")}
              >
                {isDictActive ? (
                  <>
                    <Pencil className="h-2.5 w-2.5" />
                    <span>Ред.</span>
                  </>
                ) : (
                  <>
                    <Languages className="h-2.5 w-2.5 text-amber-400" />
                    <span>Словарь</span>
                  </>
                )}
              </button>
            )}
          </div>

          {isDictActive ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full min-h-[30px] rounded border border-amber-500/40 bg-slate-950/80 px-2.5 py-1.5 text-sm text-slate-100"
            >
              <TokenizedBubbleText
                japText={block.japText}
                tokens={tokens}
                titleId={titleId}
                onStartEdit={() => setIsEditingJapField(true)}
                onSetSpeaker={(speakerName) => onChange({ speaker: speakerName })}
              />
            </div>
          ) : (
            <textarea
              value={block.japText}
              onChange={(e) => onChange({ japText: e.target.value })}
              onBlur={() => setIsEditingJapField(false)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Японский текст…"
              rows={1}
              className="w-full min-h-[30px] resize-y rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          )}
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
              beginRusEditSession()
            }}
            onBlur={() => {
              setIsFocusedRus(false)
              if (localRusText.trim() !== snapshotLinesRef.current.join("\n").trim()) {
                saveStorageTextToBlock(buildRusStorageText(localRusText.trim()))
              }
            }}
            onChange={(e) => {
              handleRusTextChange(e.target.value)
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

// manga_ui/components/image-viewer/tokenized-bubble-text.tsx
// Интерактивный токенизированный японский текст бабла:
// - Слитный рендеринг <span> внутри <div lang="ja"> (100% совместимость с внешними Yomitan / Rikaikun)
// - Изумрудная подсветка терминов Глоссария тайтла, фиолетовая — имён собственных (NER)
// - Всплывающая карточка словаря в FloatingPortal с safePolygon (@floating-ui/react)
// - Добавление/редактирование термина в Глоссарий тайтла в 1 клик и подстановка Speaker

"use client"

import React, { useState, useRef } from "react"
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useInteractions,
  safePolygon,
  FloatingPortal,
} from "@floating-ui/react"
import { BookMarked, Plus, Check, UserPlus, Sparkles } from "lucide-react"
import {
  type TokenSpan,
  type GlossaryHit,
  upsertGlossaryFromDictionary,
} from "@/lib/api/dictionary"

export interface TokenizedBubbleTextProps {
  japText: string
  tokens: TokenSpan[] | null
  titleId?: number | null
  onGlossaryUpdated?: (hit: GlossaryHit) => void
  onSetSpeaker?: (speakerName: string) => void
  onStartEdit?: (e: React.MouseEvent) => void
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  warodai: {
    label: "Warodai",
    cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  },
  jmdict_ru: {
    label: "JMdict RU",
    cls: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  },
  jmdict_en: {
    label: "JMdict EN",
    cls: "bg-slate-700 text-slate-300 border-slate-600",
  },
  jmnedict: {
    label: "Имена",
    cls: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  },
}

function InteractiveTokenSpan({
  token,
  titleId,
  onGlossaryUpdated,
  onSetSpeaker,
  onStartEdit,
}: {
  token: TokenSpan
  titleId?: number | null
  onGlossaryUpdated?: (hit: GlossaryHit) => void
  onSetSpeaker?: (speakerName: string) => void
  onStartEdit?: (e: React.MouseEvent) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAddingGlossary, setIsAddingGlossary] = useState(false)
  const [japInput, setJapInput] = useState("")
  const [ruInput, setRuInput] = useState("")
  const [contextInput, setContextInput] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const ruInputRef = useRef<HTMLInputElement>(null)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      setIsOpen(open)
      if (!open) {
        setIsAddingGlossary(false)
      }
    },
    placement: "top-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end", padding: 12 }),
      shift({ padding: 12 }),
    ],
  })

  const hover = useHover(context, {
    move: false,
    delay: { open: 70, close: 160 },
    handleClose: safePolygon({ blockPointerEvents: true }),
  })
  const focus = useFocus(context)
  const dismiss = useDismiss(context)

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss])

  const isGlossary = Boolean(token.glossary_match)
  const isNamedEntity = Boolean(
    !isGlossary &&
      (token.ner_label === "PERSON" ||
        token.ner_label === "LOC" ||
        token.ner_label === "PROPN" ||
        token.pos_ru === "Имя собственное")
  )
  const hasDictEntries = token.dict_entries && token.dict_entries.length > 0

  // Пунктуация и одиночные частицы без статей рендерятся как чистый текстовый спан
  if (token.is_punct_or_particle && !isGlossary && !isNamedEntity && !hasDictEntries) {
    return <span onDoubleClick={onStartEdit}>{token.surface}</span>
  }

  const handleOpenGlossaryForm = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsAddingGlossary(true)
    setJapInput(token.glossary_match?.jap_word || token.lemma || token.surface)
    setRuInput(token.glossary_match?.rus_word || "")
    setContextInput(
      token.glossary_match?.context ||
        (token.ner_label === "PERSON" ? "Персонаж" : token.ner_label === "LOC" ? "Локация" : "")
    )
    setTimeout(() => ruInputRef.current?.focus(), 20)
  }

  const handleSaveGlossary = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!titleId || !japInput.trim() || !ruInput.trim() || isSaving) return

    setIsSaving(true)
    try {
      const saved = await upsertGlossaryFromDictionary({
        title_id: titleId,
        jap_word: japInput.trim(),
        rus_word: ruInput.trim(),
        context: contextInput.trim(),
      })
      onGlossaryUpdated?.(saved)
      setIsAddingGlossary(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1800)
    } catch (err) {
      alert("Не удалось сохранить в глоссарий: " + String(err))
    } finally {
      setIsSaving(false)
    }
  }

  let spanClassName =
    "cursor-pointer border-b border-transparent hover:border-sky-400/80 hover:bg-sky-500/15 transition-colors rounded-[2px]"
  if (isGlossary) {
    spanClassName =
      "cursor-pointer text-emerald-300 font-semibold border-b-2 border-emerald-500/80 hover:bg-emerald-500/20 transition-colors rounded-[2px]"
  } else if (isNamedEntity) {
    spanClassName =
      "cursor-pointer text-purple-200 border-b border-dashed border-purple-400/80 hover:bg-purple-500/20 transition-colors rounded-[2px]"
  }

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps({
          onDoubleClick: onStartEdit,
        })}
        className={spanClassName}
      >
        {token.surface}
      </span>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps({
              onMouseDown: (e) => e.stopPropagation(),
              onClick: (e) => e.stopPropagation(),
            })}
            className="z-[9999] w-80 max-w-sm rounded-xl bg-slate-900/98 border border-slate-700/90 p-3.5 text-slate-100 shadow-2xl backdrop-blur-md text-xs leading-relaxed font-sans select-text"
          >
            {/* Шапка карточки: Лемма 【Чтение】, поверхностная форма и цепочка спряжений */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="min-w-0">
                <div className="flex items-baseline flex-wrap gap-1.5">
                  <span
                    lang="ja"
                    className="text-base font-bold text-white tracking-wide"
                  >
                    {token.lemma || token.surface}
                  </span>
                  {token.reading && token.reading !== (token.lemma || token.surface) && (
                    <span lang="ja" className="text-xs font-medium text-sky-300">
                      【{token.reading}】
                    </span>
                  )}
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                  {token.surface !== token.lemma && (
                    <span>
                      в тексте: <span lang="ja" className="text-slate-200 font-medium">{token.surface}</span> •
                    </span>
                  )}
                  <span className="text-indigo-300 font-medium">{token.pos_ru}</span>
                  {isNamedEntity && (
                    <span className="rounded bg-purple-500/25 border border-purple-500/40 px-1.5 py-0.2 text-[9px] font-semibold text-purple-200">
                      {token.ner_label === "PERSON" ? "Имя / Персонаж" : "Имя собств."}
                    </span>
                  )}
                </div>

                {token.inflection_chain && token.inflection_chain.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {token.inflection_chain.map((reason, rIdx) => (
                      <span
                        key={rIdx}
                        className="rounded bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Приоритетный блок Глоссария тайтла */}
            {token.glossary_match && (
              <div className="mt-2.5 rounded-lg bg-emerald-950/70 border border-emerald-500/40 p-2.5 text-emerald-100">
                <div className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <BookMarked className="h-3 w-3" />
                    Из глоссария тайтла
                  </span>
                  {onSetSpeaker && (
                    <button
                      type="button"
                      onClick={() => onSetSpeaker(token.glossary_match!.rus_word)}
                      className="flex items-center gap-0.5 rounded bg-emerald-800/60 hover:bg-emerald-700 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100 transition-colors normal-case"
                      title="Установить это имя в поле Speaker текущего бабла"
                    >
                      <UserPlus className="h-2.5 w-2.5" />
                      В Speaker
                    </button>
                  )}
                </div>
                <div className="mt-1 text-sm font-bold text-white">
                  {token.glossary_match.rus_word}
                </div>
                {token.glossary_match.context && (
                  <div className="mt-0.5 text-[11px] text-emerald-300/90 italic">
                    {token.glossary_match.context}
                  </div>
                )}
              </div>
            )}

            {/* Список словарных статей (Warodai + JMdict RU/EN) */}
            <div className="mt-2.5 max-h-48 overflow-y-auto space-y-2 pr-1">
              {hasDictEntries ? (
                token.dict_entries.map((entry, idx) => {
                  const badge = SOURCE_BADGE[entry.source] || SOURCE_BADGE.jmdict_ru
                  return (
                    <div key={idx} className="border-l-2 border-slate-700 pl-2">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`rounded border px-1.5 py-0.2 text-[9px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {entry.kanji !== token.lemma && (
                          <span lang="ja" className="text-[11px] font-semibold text-slate-200">
                            {entry.kanji}
                          </span>
                        )}
                        {entry.reading && (
                          <span lang="ja" className="text-[10px] text-sky-300/90">
                            [{entry.reading}]
                          </span>
                        )}
                        {entry.pos && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                            {entry.pos}
                          </span>
                        )}
                      </div>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-200">
                        {entry.meanings.slice(0, 4).map((m, mIdx) => (
                          <li key={mIdx} className="leading-snug break-words">
                            {m}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )
                })
              ) : (
                !token.glossary_match && (
                  <div className="text-slate-400 italic py-1 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span>
                      {isNamedEntity
                        ? "Распознано как имя собственное — добавьте в глоссарий тайтла ниже"
                        : "Точное словарное совпадение не найдено"}
                    </span>
                  </div>
                )
              )}
            </div>

            {/* Мини-форма быстрого добавления / редактирования в Глоссарии тайтла */}
            {titleId ? (
              <div className="mt-3 border-t border-slate-800 pt-2">
                {justSaved ? (
                  <div className="flex items-center justify-center gap-1 rounded bg-emerald-950/80 border border-emerald-500/40 py-1 px-2 text-[11px] font-semibold text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                    Сохранено в глоссарий тайтла!
                  </div>
                ) : !isAddingGlossary ? (
                  <button
                    type="button"
                    onClick={handleOpenGlossaryForm}
                    className="flex w-full items-center justify-center gap-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-medium py-1.5 px-2 text-center transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>
                      {token.glossary_match ? "Изменить в глоссарии тайтла" : "В глоссарий тайтла"}
                    </span>
                  </button>
                ) : (
                  <form onSubmit={handleSaveGlossary} className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={japInput}
                        onChange={(e) => setJapInput(e.target.value)}
                        placeholder="Японский..."
                        className="w-2/5 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                      />
                      <input
                        ref={ruInputRef}
                        type="text"
                        required
                        value={ruInput}
                        onChange={(e) => setRuInput(e.target.value)}
                        placeholder="Перевод / Имя (Enter)"
                        className="w-3/5 rounded bg-slate-950 border border-emerald-600/80 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none"
                      />
                    </div>
                    <input
                      type="text"
                      value={contextInput}
                      onChange={(e) => setContextInput(e.target.value)}
                      placeholder="Контекст / род / кто это (опц.)"
                      className="w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-[11px] text-slate-300 focus:border-slate-600 focus:outline-none"
                    />
                    <div className="flex justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsAddingGlossary(false)}
                        className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving || !ruInput.trim()}
                        className="rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors"
                      >
                        {isSaving ? "..." : "Сохранить"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

export function TokenizedBubbleText({
  japText,
  tokens,
  titleId,
  onGlossaryUpdated,
  onSetSpeaker,
  onStartEdit,
}: TokenizedBubbleTextProps) {
  // Пока токены загружаются или если они пусты — рендерим плоский текст без скачков верстки
  if (!tokens || tokens.length === 0) {
    return (
      <div
        lang="ja"
        onDoubleClick={onStartEdit}
        className="select-text cursor-text tracking-wide"
      >
        {japText}
      </div>
    )
  }

  // Важно: внутри <div lang="ja"> спаны рендерятся слитно без пробелов,
  // чтобы внешние браузерные расширения Yomitan / Rikaikun читали непрерывный текстовый узел.
  return (
    <div
      lang="ja"
      onDoubleClick={onStartEdit}
      className="select-text tracking-wide"
    >
      {tokens.map((token, idx) => (
        <InteractiveTokenSpan
          key={`${idx}-${token.surface}`}
          token={token}
          titleId={titleId}
          onGlossaryUpdated={onGlossaryUpdated}
          onSetSpeaker={onSetSpeaker}
          onStartEdit={onStartEdit}
        />
      ))}
    </div>
  )
}

// manga_ui/components/hotkeys-modal.tsx
// Интерактивное окно переназначения горячих клавиш

"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Keyboard, RotateCcw, X, AlertTriangle, Check } from "lucide-react"
import {
  type HotkeyActionId,
  type HotkeyCategory,
  formatKeyEvent,
} from "@/lib/hotkeys"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"

interface HotkeysModalProps {
  onClose: () => void
}

const CATEGORY_NAMES: Record<HotkeyCategory, string> = {
  navigation: "Навигация и Тайпсет",
  font: "Шрифты и размер",
  bubble: "Типы и разметка бабла",
  cleaning: "Очистка (Spot Clean)",
  tools: "Инструменты кисти",
  chapter: "Действия с главой",
}

export function HotkeysModal({ onClose }: HotkeysModalProps) {
  const [mounted, setMounted] = useState(false)
  const { hotkeys, updateHotkey, resetHotkeys } = useHotkeysConfig()
  const [recordingAction, setRecordingAction] = useState<HotkeyActionId | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (!recordingAction) {
        if (e.key === "Escape") onClose()
        return
      }

      e.preventDefault()
      e.stopPropagation()

      if (e.key === "Escape") {
        setRecordingAction(null)
        setConflictMessage(null)
        return
      }

      const formatted = formatKeyEvent(e)
      if (!formatted) return

      const existingConflict = (Object.keys(hotkeys) as HotkeyActionId[]).find((key) => {
        if (key === recordingAction) return false
        const b = hotkeys[key]
        return (
          b.code === formatted.code &&
          Boolean(b.ctrl) === formatted.ctrl &&
          Boolean(b.shift) === formatted.shift &&
          Boolean(b.alt) === formatted.alt
        )
      })

      if (existingConflict) {
        setConflictMessage(`Клавиша ${formatted.label} уже занята действием "${hotkeys[existingConflict].name}"`)
        setTimeout(() => setConflictMessage(null), 3000)
      }

      updateHotkey(recordingAction, {
        code: formatted.code,
        ctrl: formatted.ctrl,
        shift: formatted.shift,
        alt: formatted.alt,
        label: formatted.label,
      })

      setRecordingAction(null)
    }

    window.addEventListener("keydown", handleGlobalKey, true)
    return () => window.removeEventListener("keydown", handleGlobalKey, true)
  }, [recordingAction, hotkeys, updateHotkey, onClose])

  if (!mounted) return null

  const categories: HotkeyCategory[] = ["navigation", "bubble", "font", "cleaning", "tools", "chapter"]

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="flex h-[640px] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/30 text-indigo-400">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Горячие клавиши</h3>
              <p className="text-xs text-slate-400">Кликните на кнопку клавиши, чтобы переназначить её</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetHotkeys}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              title="Сбросить все бинды к исходным"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              Сброс
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Закрыть (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {conflictMessage && (
          <div className="flex items-center gap-2 bg-amber-950/60 border-b border-amber-800/60 px-6 py-2 text-xs text-amber-300 animate-in fade-in">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{conflictMessage}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
          {categories.map((category) => {
            const actions = (Object.keys(hotkeys) as HotkeyActionId[]).filter(
              (key) => hotkeys[key].category === category
            )
            if (actions.length === 0) return null

            return (
              <div key={category} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 pb-1">
                  {CATEGORY_NAMES[category]}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {actions.map((actKey) => {
                    const item = hotkeys[actKey]
                    const isRec = recordingAction === actKey

                    return (
                      <div
                        key={actKey}
                        className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-xs"
                      >
                        <span className="text-slate-300 font-medium truncate pr-2">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => setRecordingAction(actKey)}
                          className={[
                            "min-w-[70px] rounded px-2.5 py-1 text-center font-mono text-xs font-bold transition-all border",
                            isRec
                              ? "bg-amber-500 text-slate-950 border-amber-400 animate-pulse ring-2 ring-amber-400/40"
                              : "bg-slate-800 border-slate-700 text-indigo-300 hover:bg-slate-700 hover:text-white",
                          ].join(" ")}
                        >
                          {isRec ? "Нажмите..." : item.label}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-6 py-3 text-xs text-slate-400">
          <span>Нажмите Esc для отмены записи или закрытия окна</span>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Check className="h-4 w-4" />
            Готово
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
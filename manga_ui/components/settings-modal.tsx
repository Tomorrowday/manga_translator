// manga_ui/components/settings-modal.tsx
// Единое окно ГЛОБАЛЬНЫХ настроек с интеграцией моделей, тогглов и Ollama

"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import {
  Sliders,
  ToggleLeft,
  X,
  Loader2,
  Check,
  Save,
  Scan,
  Sparkles,
  Type,
  Maximize2,
  WrapText,
  CircleDot,
  Bot,
  RefreshCw,
} from "lucide-react"
import type { TitleSettings } from "@/lib/types"
import { MANGA_FONTS } from "@/lib/hotkeys"
import { getGlobalSettings, updateGlobalSettings } from "@/lib/api/projects"
import { checkOllamaConnection } from "@/lib/api/ollama"

interface SettingsModalProps {
  onClose: () => void
  onSettingsUpdated?: (newSettings: TitleSettings) => void
}

export function SettingsModal({
  onClose,
  onSettingsUpdated,
}: SettingsModalProps) {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<"toggles" | "parameters">("toggles")
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const [availableDetectors, setAvailableDetectors] = useState<Record<string, string>>({})
  const [availableCleaners, setAvailableCleaners] = useState<Record<string, string>>({})

  // Тогглы
  const [autoOvalBubble, setAutoOvalBubble] = useState<boolean>(true)
  const [defaultPadding, setDefaultPadding] = useState<"safe" | "fit">("safe")
  const [defaultHyphenation, setDefaultHyphenation] = useState<boolean>(true)

  // Параметры
  const [detectorModel, setDetectorModel] = useState<string>("yolo_manga.pt")
  const [cleanModel, setCleanModel] = useState<string>("anime-manga-big-lama.pt")
  const [detectConf, setDetectConf] = useState<number>(0.25)
  const [defaultFontSize, setDefaultFontSize] = useState<number>(14)
  const [fontBubble, setFontBubble] = useState<string>("v_CCFaceFront")
  const [fontThought, setFontThought] = useState<string>("v_CCFaceFront")
  const [fontSfx, setFontSfx] = useState<string>("v_Mighty Zeo 2.0")

  // Ollama
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "online" | "offline">("checking")
  const [ollamaModels, setOllamaModels] = useState<string[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [onClose])

  const testOllama = async () => {
    setOllamaStatus("checking")
    const res = await checkOllamaConnection("http://localhost:11434")
    if (res.ok) {
      setOllamaStatus("online")
      setOllamaModels(res.models)
    } else {
      setOllamaStatus("offline")
      setOllamaModels([])
    }
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const res = await getGlobalSettings()
        if (res.success && res.settings) {
          const s = res.settings
          if (s.available_detectors) setAvailableDetectors(s.available_detectors)
          if (s.available_cleaners) setAvailableCleaners(s.available_cleaners)

          if (s.detector_model) setDetectorModel(s.detector_model)
          if (s.clean_model) setCleanModel(s.clean_model)
          if (s.detect_conf !== undefined) setDetectConf(s.detect_conf)
          if (s.default_font_size !== undefined) setDefaultFontSize(s.default_font_size)

          if (s.auto_oval_bubble !== undefined) setAutoOvalBubble(Boolean(s.auto_oval_bubble))
          if (s.default_padding) setDefaultPadding(s.default_padding)
          if (s.default_hyphenation !== undefined) setDefaultHyphenation(Boolean(s.default_hyphenation))

          if (s.font_bubble) setFontBubble(s.font_bubble)
          if (s.font_thought) setFontThought(s.font_thought)
          if (s.font_sfx) setFontSfx(s.font_sfx)
        }
      } catch (err) {
        console.error("Ошибка загрузки глобальных настроек:", err)
      } finally {
        setLoading(false)
        testOllama()
      }
    }
    loadData()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload: Partial<TitleSettings> = {
        detector_model: detectorModel,
        clean_model: cleanModel,
        detect_conf: detectConf,
        default_font_size: defaultFontSize,
        auto_oval_bubble: autoOvalBubble,
        default_padding: defaultPadding,
        default_hyphenation: defaultHyphenation,
        font_bubble: fontBubble,
        font_thought: fontThought,
        font_sfx: fontSfx,
      }

      const res = await updateGlobalSettings(payload)
      if (res.success) {
        setSavedSuccess(true)
        onSettingsUpdated?.(payload)
        setTimeout(() => setSavedSuccess(false), 2000)
      }
    } catch (err) {
      alert("Ошибка сохранения: " + String(err))
    } finally {
      setIsSaving(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="flex h-[640px] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Шапка */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Глобальные настройки приложения</h3>
              <p className="text-xs text-slate-400">Действуют для всех тайтлов, страниц и операций</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("toggles")}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "toggles"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                <ToggleLeft className="h-3.5 w-3.5" />
                Тогглы
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("parameters")}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "parameters"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                <Sliders className="h-3.5 w-3.5" />
                Параметры и Модели
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Закрыть (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Тело модалки */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              Загрузка глобальных настроек...
            </div>
          ) : activeTab === "toggles" ? (
            <div className="space-y-4">

              {/* Тоггл: Авто-овал для баблов речи */}
              <div className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 transition-colors hover:border-slate-700">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <CircleDot className="h-4 w-4 text-indigo-400" />
                    <label className="text-xs font-semibold text-slate-200">
                      Автоматически ставить Овал для баблов речи (тип 0)
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Все найденные или нарисованные баблы речи (класс 0) сразу получают овальную форму с оптическим центрированием текста.
                    Мысли (класс 1) и надписи на арте (класс 2) остаются прямоугольными.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoOvalBubble(!autoOvalBubble)}
                  className={[
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    autoOvalBubble ? "bg-indigo-600" : "bg-slate-800",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                      autoOvalBubble ? "translate-x-5" : "translate-x-0",
                    ].join(" ")}
                  />
                </button>
              </div>

              {/* Тоггл: Режим отступа Safe / Fit */}
              <div className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 transition-colors hover:border-slate-700">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="h-4 w-4 text-emerald-400" />
                    <label className="text-xs font-semibold text-slate-200">
                      Режим отступа по умолчанию (Padding Mode)
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <strong>Safe:</strong> безопасный внутренний зазор, исключающий касание контура.<br />
                    <strong>Fit:</strong> максимальное заполнение площади для длинных фраз.
                  </p>
                </div>

                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDefaultPadding("safe")}
                    className={[
                      "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                      defaultPadding === "safe"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-slate-200",
                    ].join(" ")}
                  >
                    Safe
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultPadding("fit")}
                    className={[
                      "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                      defaultPadding === "fit"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-slate-200",
                    ].join(" ")}
                  >
                    Fit
                  </button>
                </div>
              </div>

              {/* Тоггл: Переносы по умолчанию */}
              <div className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 transition-colors hover:border-slate-700">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <WrapText className="h-4 w-4 text-teal-400" />
                    <label className="text-xs font-semibold text-slate-200">
                      Слогоразбивка и переносы (дефисы) по умолчанию
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <strong>С переносами:</strong> переносит слова по слогам орфографии при необходимости.<br />
                    <strong>Без переносов:</strong> переносит на новую строку только целые слова без дефисов.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDefaultHyphenation(!defaultHyphenation)}
                  className={[
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    defaultHyphenation ? "bg-teal-600" : "bg-slate-800",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                      defaultHyphenation ? "translate-x-5" : "translate-x-0",
                    ].join(" ")}
                  />
                </button>
              </div>

            </div>
          ) : (
            <div className="space-y-4">

              {/* Модель детектора */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Scan className="h-3.5 w-3.5 text-indigo-400" />
                      Модель детектора (weights/detect-bubble)
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Нейросеть YOLO для поиска баблов и текста.
                    </p>
                  </div>

                  <select
                    value={detectorModel}
                    onChange={(e) => setDetectorModel(e.target.value)}
                    className="w-56 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 outline-none focus:border-indigo-500"
                  >
                    {Object.entries(availableDetectors).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Модель клина */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                      Модель клина (weights/clean-lama)
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Нейросеть Inpainting для удаления звуков и фона.
                    </p>
                  </div>

                  <select
                    value={cleanModel}
                    onChange={(e) => setCleanModel(e.target.value)}
                    className="w-56 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 outline-none focus:border-indigo-500"
                  >
                    {Object.entries(availableCleaners).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Порог детекции (Confidence) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Порог срабатывания детектора (Confidence)
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Регулирует чувствительность к мелким звукам и артефактам.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.10"
                      max="0.80"
                      step="0.05"
                      value={detectConf}
                      onChange={(e) => setDetectConf(parseFloat(e.target.value))}
                      className="h-1.5 w-32 cursor-pointer accent-indigo-500"
                    />
                    <span className="w-12 text-center font-mono text-xs font-bold text-indigo-300 rounded bg-slate-900 px-2 py-1 border border-slate-800">
                      {detectConf.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Базовый размер шрифта */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Type className="h-3.5 w-3.5 text-indigo-400" />
                      Базовый кегль шрифта
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Стартовый размер при автоматической подгонке под бабл.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDefaultFontSize((prev) => Math.max(8, prev - 1))}
                      className="h-7 w-7 rounded bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={8}
                      max={40}
                      value={defaultFontSize}
                      onChange={(e) => setDefaultFontSize(Math.max(8, Math.min(40, Number(e.target.value) || 14)))}
                      className="h-7 w-14 rounded border border-slate-700 bg-slate-900 text-center font-mono text-xs font-bold text-indigo-300 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setDefaultFontSize((prev) => Math.min(40, prev + 1))}
                      className="h-7 w-7 rounded bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700"
                    >
                      +
                    </button>
                    <span className="text-xs text-slate-400 font-mono">px</span>
                  </div>
                </div>
              </div>

              {/* Стандартные шрифты по типам */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Стандартный шрифт по типу бабла
                </label>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <span className="block text-[11px] font-medium text-emerald-400 mb-1">
                      Речь (Тип 0):
                    </span>
                    <select
                      value={fontBubble}
                      onChange={(e) => setFontBubble(e.target.value)}
                      className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                    >
                      {MANGA_FONTS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-sky-400 mb-1">
                      Мысли (Тип 1):
                    </span>
                    <select
                      value={fontThought}
                      onChange={(e) => setFontThought(e.target.value)}
                      className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                    >
                      {MANGA_FONTS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-purple-400 mb-1">
                      Текст/SFX (Тип 2):
                    </span>
                    <select
                      value={fontSfx}
                      onChange={(e) => setFontSfx(e.target.value)}
                      className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                    >
                      {MANGA_FONTS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Статус Ollama */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-semibold text-slate-200">Локальная нейросеть (Ollama)</span>
                      <p className="text-[11px] text-slate-500">http://localhost:11434</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={[
                      "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      ollamaStatus === "online" ? "bg-emerald-950 text-emerald-300 border border-emerald-800" :
                      ollamaStatus === "checking" ? "bg-amber-950 text-amber-300 border border-amber-800" :
                      "bg-rose-950 text-rose-300 border border-rose-800"
                    ].join(" ")}>
                      <span className={`h-1.5 w-1.5 rounded-full ${ollamaStatus === "online" ? "bg-emerald-400" : ollamaStatus === "checking" ? "bg-amber-400 animate-ping" : "bg-rose-400"}`} />
                      {ollamaStatus === "online" ? "Подключена" : ollamaStatus === "checking" ? "Проверка..." : "Не запущена"}
                    </span>

                    <button
                      type="button"
                      onClick={testOllama}
                      className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                      title="Проверить соединение с Ollama"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {ollamaStatus === "online" && ollamaModels.length > 0 && (
                  <p className="text-[11px] text-slate-400 pt-1">
                    Обнаружены модели: <span className="text-emerald-300 font-mono">{ollamaModels.join(", ")}</span>
                  </p>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Футер */}
        <footer className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-6 py-3.5 text-xs">
          <span className="text-slate-400">Глобальные настройки действуют на всё приложение</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={[
                "flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-medium text-white transition-all shadow-md",
                savedSuccess ? "bg-emerald-600" : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50",
              ].join(" ")}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedSuccess ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savedSuccess ? "Сохранено!" : "Сохранить"}
            </button>
          </div>
        </footer>

      </div>
    </div>,
    document.body
  )
}
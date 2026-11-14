// manga_ui/components/settings-modal_impl.tsx
// Оркестратор окна глобальных настроек: шапка с переключателем вкладок, загрузка/сохранение, футер.
// Вкладки вынесены в components/settings-modal/: «Тогглы», «Параметры и Модели» и карточка статуса Ollama.

"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Sliders, ToggleLeft, X, Loader2, Check, Save } from "lucide-react"
import type { TitleSettings } from "@/lib/types"
import { getGlobalSettings, updateGlobalSettings } from "@/lib/api/projects"
import { checkOllamaConnection } from "@/lib/api/ollama"
import { SettingsTogglesTab } from "@/components/settings-modal/settings-toggles-tab"
import { SettingsParametersTab } from "@/components/settings-modal/settings-parameters-tab"
import type { OllamaStatus } from "@/components/settings-modal/ollama-status-card"
import type { SettingsModalProps } from "./settings-modal"

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

  // Тогглы тайпсета
  const [autoOvalBubble, setAutoOvalBubble] = useState<boolean>(true)
  const [defaultPadding, setDefaultPadding] = useState<"safe" | "fit">("safe")
  const [defaultHyphenation, setDefaultHyphenation] = useState<boolean>(true)

  // Тогглы клинера (LaMa)
  const [lamaDownscale, setLamaDownscale] = useState<boolean>(false)

  // Тоггл: детектировать звуки SFX (класс 3)
  const [showSfx, setShowSfx] = useState<boolean>(false)

  // Параметры моделей и шрифтов
  const [detectorModel, setDetectorModel] = useState<string>("yolo_manga.pt")
  const [cleanModel, setCleanModel] = useState<string>("anime-manga-big-lama.pt")
  const [detectConf, setDetectConf] = useState<number>(0.25)
  const [fontBubble, setFontBubble] = useState<string>("v_CCFaceFront")
  const [fontThought, setFontThought] = useState<string>("v_CCFaceFront")
  const [fontSfx, setFontSfx] = useState<string>("v_Mighty Zeo 2.0")

  // Ollama
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>("checking")
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

          if (s.auto_oval_bubble !== undefined) setAutoOvalBubble(Boolean(s.auto_oval_bubble))
          if (s.default_padding) setDefaultPadding(s.default_padding)
          if (s.default_hyphenation !== undefined) setDefaultHyphenation(Boolean(s.default_hyphenation))

          if (s.lama_downscale !== undefined) setLamaDownscale(Boolean(s.lama_downscale))
          if (s.show_sfx !== undefined) setShowSfx(Boolean(s.show_sfx))

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
        auto_oval_bubble: autoOvalBubble,
        default_padding: defaultPadding,
        default_hyphenation: defaultHyphenation,
        lama_downscale: lamaDownscale,
        show_sfx: showSfx,
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
      <div className="flex h-[660px] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Шапка */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Глобальные настройки приложения</h3>
              <p className="text-xs text-slate-400">Действуют для всех тайтлов и страниц</p>
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
            <SettingsTogglesTab
              showSfx={showSfx}
              onShowSfxChange={setShowSfx}
              lamaDownscale={lamaDownscale}
              onLamaDownscaleChange={setLamaDownscale}
              autoOvalBubble={autoOvalBubble}
              onAutoOvalBubbleChange={setAutoOvalBubble}
              defaultPadding={defaultPadding}
              onDefaultPaddingChange={setDefaultPadding}
              defaultHyphenation={defaultHyphenation}
              onDefaultHyphenationChange={setDefaultHyphenation}
            />
          ) : (
            <SettingsParametersTab
              availableDetectors={availableDetectors}
              availableCleaners={availableCleaners}
              detectorModel={detectorModel}
              onDetectorModelChange={setDetectorModel}
              cleanModel={cleanModel}
              onCleanModelChange={setCleanModel}
              detectConf={detectConf}
              onDetectConfChange={setDetectConf}
              fontBubble={fontBubble}
              onFontBubbleChange={setFontBubble}
              fontThought={fontThought}
              onFontThoughtChange={setFontThought}
              fontSfx={fontSfx}
              onFontSfxChange={setFontSfx}
              ollamaStatus={ollamaStatus}
              ollamaModels={ollamaModels}
              onRefreshOllama={testOllama}
            />
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

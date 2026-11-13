// manga_ui/components/settings-modal/settings-toggles-tab.tsx
// Вкладка «Тогглы» глобальных настроек: SFX, Downscale, авто-овал, Safe/Fit, переносы

"use client"

import { Volume2, Layers, CircleDot, Maximize2, WrapText } from "lucide-react"

export interface SettingsTogglesTabProps {
  showSfx: boolean
  onShowSfxChange: (value: boolean) => void
  lamaDownscale: boolean
  onLamaDownscaleChange: (value: boolean) => void
  autoOvalBubble: boolean
  onAutoOvalBubbleChange: (value: boolean) => void
  defaultPadding: "safe" | "fit"
  onDefaultPaddingChange: (value: "safe" | "fit") => void
  defaultHyphenation: boolean
  onDefaultHyphenationChange: (value: boolean) => void
}

export function SettingsTogglesTab({
  showSfx,
  onShowSfxChange,
  lamaDownscale,
  onLamaDownscaleChange,
  autoOvalBubble,
  onAutoOvalBubbleChange,
  defaultPadding,
  onDefaultPaddingChange,
  defaultHyphenation,
  onDefaultHyphenationChange,
}: SettingsTogglesTabProps) {
  return (
    <div className="space-y-4">

      {/* Тоггл: Детектирование звуков SFX */}
      <div className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 transition-colors hover:border-slate-700">
        <div className="space-y-1 pr-4">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-orange-400" />
            <label className="text-xs font-semibold text-slate-200">
              Детектировать звуки (SFX, класс 3)
            </label>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <strong>Выключено (по умолчанию):</strong> нейросеть при поиске баблов игнорирует звуковые эффекты (они не попадают в разметку, OCR и под автоклин).<br />
            <strong>Включено:</strong> находить звуки SFX на скане для их последующего перевода и тайпсета.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onShowSfxChange(!showSfx)}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
            showSfx ? "bg-orange-600" : "bg-slate-800",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
              showSfx ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>

      {/* Тоггл: Сжатие перед клином */}
      <div className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 transition-colors hover:border-slate-700">
        <div className="space-y-1 pr-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-pink-400" />
            <label className="text-xs font-semibold text-slate-200">
              Сжатие картинок перед клином (Downscale)
            </label>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <strong>Выключено (по умолчанию):</strong> 100% оригинальное разрешение и чёткость. Скринтоны и арт не размываются.<br />
            <strong>Включено:</strong> сжимает огромные сканы (выше 2048px) перед отправкой в нейросеть для экономии VRAM.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onLamaDownscaleChange(!lamaDownscale)}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
            lamaDownscale ? "bg-pink-600" : "bg-slate-800",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
              lamaDownscale ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>

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
            Баблы речи (класс 0) при появлении перевода сразу получают овальную форму с оптическим центрированием текста.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onAutoOvalBubbleChange(!autoOvalBubble)}
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
            onClick={() => onDefaultPaddingChange("safe")}
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
            onClick={() => onDefaultPaddingChange("fit")}
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
          onClick={() => onDefaultHyphenationChange(!defaultHyphenation)}
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
  )
}

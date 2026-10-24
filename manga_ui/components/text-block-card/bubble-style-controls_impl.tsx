// manga_ui/components/text-block-card/bubble-style-controls_impl.tsx
// Динамический селектор шрифтов и кнопки с лейблами хоткеев

"use client"

import {
  Bold,
  Italic,
  Square,
  CircleDot,
  Maximize2,
  Shield,
  WrapText,
  Palette,
} from "lucide-react"
import { MANGA_FONTS } from "@/lib/hotkeys"
import { useHotkeysConfig } from "@/hooks/use-manga-hotkeys"
import type { BubbleStyleControlsProps } from "./bubble-style-controls"

export function BubbleStyleControls({
  block,
  defaultFontSize = 14,
  onChange,
}: BubbleStyleControlsProps) {
  const { hotkeys } = useHotkeysConfig()

  const isEllipse = block.shape === "ellipse"
  const isFit = block.paddingMode === "fit"
  const isMinHyphens = block.minHyphens !== false
  const isWhiteText = block.textColor === "white"
  const isManual = block.fontSize !== undefined
  const currentEffectiveSize = block.fontSize ?? defaultFontSize

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 space-y-1.5 rounded-md border border-slate-800 bg-slate-950/40 p-1.5 text-xs"
    >
      {/* Динамический селектор шрифтов из реестра MANGA_FONTS */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Font:</span>
        <select
          value={block.fontFamily || "v_CCFaceFront"}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500"
        >
          {MANGA_FONTS.map((f) => {
            const fontHotkeyLabel = hotkeys[`font${f.index}` as keyof typeof hotkeys]?.label || String(f.index)
            return (
              <option key={f.id} value={f.id}>
                [{fontHotkeyLabel}] {f.label}
              </option>
            )
          })}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1">
        {/* Управление размером шрифта с отображением текущего реального кегля */}
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            onClick={() => onChange({ fontSize: Math.max(8, currentEffectiveSize - 1) })}
            className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors font-mono font-bold"
            title={`Уменьшить шрифт [${hotkeys.fontSizeDown.label}]`}
          >
            -
          </button>

          <button
            type="button"
            onClick={() => onChange({ fontSize: isManual ? undefined : currentEffectiveSize })}
            className={[
              "px-2 h-6 rounded text-[10px] font-bold transition-all border",
              !isManual
                ? "border-indigo-500/60 bg-indigo-600/30 text-indigo-200"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700",
            ].join(" ")}
            title={
              !isManual
                ? `Авто-размер (базовый кегль тайтла: ${defaultFontSize}px). Нажмите, чтобы зафиксировать.`
                : `Кегль зафиксирован: ${block.fontSize}px. Нажмите, чтобы сбросить в Auto.`
            }
          >
            {!isManual ? `Auto (${currentEffectiveSize}px)` : `${block.fontSize}px (Фикс)`}
          </button>

          <button
            type="button"
            onClick={() => onChange({ fontSize: Math.min(48, currentEffectiveSize + 1) })}
            className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors font-mono font-bold"
            title={`Увеличить шрифт [${hotkeys.fontSizeUp.label}]`}
          >
            +
          </button>
        </div>

        {/* Форма, отступ, режим переносов, цвет и начертание */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ textColor: isWhiteText ? "black" : "white" })}
            className={[
              "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-bold border transition-colors",
              isWhiteText
                ? "border-slate-300 bg-white text-slate-950 shadow-sm"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800",
            ].join(" ")}
            title={
              isWhiteText
                ? "Цвет текста: Белый (обводка черная)"
                : "Цвет текста: Чёрный (обводка белая)"
            }
          >
            <Palette className="h-3 w-3" />
            {isWhiteText ? "White" : "Black"}
          </button>

          <button
            type="button"
            onClick={() => onChange({ shape: isEllipse ? "rect" : "ellipse" })}
            className={[
              "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-medium border transition-colors",
              isEllipse
                ? "border-indigo-500 bg-indigo-600/30 text-indigo-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200",
            ].join(" ")}
            title={`Форма [${hotkeys.toggleShape.label}]: Овал / Прямоугольник`}
          >
            {isEllipse ? <CircleDot className="h-3 w-3 text-indigo-400" /> : <Square className="h-3 w-3" />}
            {isEllipse ? `Oval [${hotkeys.toggleShape.label}]` : `Rect [${hotkeys.toggleShape.label}]`}
          </button>

          <button
            type="button"
            onClick={() => onChange({ paddingMode: isFit ? "safe" : "fit" })}
            className={[
              "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-medium border transition-colors",
              isFit
                ? "border-emerald-500 bg-emerald-600/30 text-emerald-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200",
            ].join(" ")}
            title={`Режим отступа [${hotkeys.togglePadding.label}]: Fit / Safe`}
          >
            {isFit ? <Maximize2 className="h-3 w-3 text-emerald-400" /> : <Shield className="h-3 w-3" />}
            {isFit ? `Fit [${hotkeys.togglePadding.label}]` : `Safe [${hotkeys.togglePadding.label}]`}
          </button>

          <button
            type="button"
            onClick={() => onChange({ minHyphens: !isMinHyphens })}
            className={[
              "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-medium border transition-colors",
              isMinHyphens
                ? "border-teal-500 bg-teal-600/30 text-teal-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200",
            ].join(" ")}
            title={`Переносы [${hotkeys.toggleHyphenation.label}]`}
          >
            <WrapText className="h-3 w-3" />
            {isMinHyphens ? `No-Hyph [${hotkeys.toggleHyphenation.label}]` : `Hyph [${hotkeys.toggleHyphenation.label}]`}
          </button>

          <button
            type="button"
            onClick={() => onChange({ isBold: !block.isBold })}
            className={[
              "p-1 rounded transition-colors",
              block.isBold ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800",
            ].join(" ")}
            title={`Жирный [${hotkeys.toggleBold.label}]`}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChange({ isItalic: !block.isItalic })}
            className={[
              "p-1 rounded transition-colors",
              block.isItalic ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800",
            ].join(" ")}
            title={`Курсив [${hotkeys.toggleItalic.label}]`}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChange({ isUppercase: !block.isUppercase })}
            className={[
              "px-1 h-6 rounded text-[11px] font-extrabold transition-colors",
              block.isUppercase ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800",
            ].join(" ")}
            title={`Все заглавные [${hotkeys.toggleUppercase.label}]`}
          >
            TT
          </button>

          <button
            type="button"
            onClick={() => onChange({ hasStroke: !block.hasStroke })}
            className={[
              "px-1.5 h-6 rounded text-[10px] font-bold border transition-colors",
              block.hasStroke
                ? "border-amber-400 bg-amber-400/20 text-amber-300"
                : "border-slate-800 bg-slate-900 text-slate-400",
            ].join(" ")}
            title={`Обводка текста [${hotkeys.toggleStroke.label}]`}
          >
            Stroke [{hotkeys.toggleStroke.label}]
          </button>
        </div>
      </div>
    </div>
  )
}
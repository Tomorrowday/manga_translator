"use client"

import {
  Bold,
  Italic,
  Square,
  CircleDot,
  Maximize2,
  Shield,
} from "lucide-react"
import type { TextBlock } from "@/lib/types"
import { BUBBLE_HOTKEYS } from "@/lib/hotkeys"

interface BubbleStyleControlsProps {
  block: TextBlock
  onChange: (patch: Partial<TextBlock>) => void
}

export function BubbleStyleControls({ block, onChange }: BubbleStyleControlsProps) {
  const isEllipse = block.shape === "ellipse"
  const isFit = block.paddingMode === "fit"

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 space-y-1.5 rounded-md border border-slate-800 bg-slate-950/40 p-1.5 text-xs"
    >
      {/* Селектор шрифта */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Font:</span>
        <select
          value={block.fontFamily || "v_CCFaceFront"}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500"
        >
          <option value="v_CCFaceFront">v_CCFaceFront (Основной)</option>
          <option value="v_Augie">v_Augie Regular</option>
          <option value="v_Blambot Casual">v_Blambot Casual Regular</option>
          <option value="v_CCYadaYadaYadaInt">v_CCYadaYadaYadaInt Regular</option>
          <option value="v_Mighty Zeo 2.0">v_Mighty Zeo 2.0 Regular</option>
          <option value="Betina Script">Betina Script</option>
          <option value="BirchCTT">BirchCTT Normal</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1">
        {/* Управление размером шрифта */}
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            onClick={() => {
              const current = block.fontSize || Math.max(11, Math.min(16, Math.round(11 + (block.height || 0.1) * 22)))
              onChange({ fontSize: Math.max(8, current - 1) })
            }}
            className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Уменьшить шрифт [-]"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => onChange({ fontSize: undefined })}
            className={[
              "px-1.5 h-6 rounded text-[10px] font-bold transition-colors",
              !block.fontSize ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200",
            ].join(" ")}
            title="Автоматический размер шрифта"
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => {
              const current = block.fontSize || Math.max(11, Math.min(16, Math.round(11 + (block.height || 0.1) * 22)))
              onChange({ fontSize: Math.min(36, current + 1) })
            }}
            className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Увеличить шрифт [+]"
          >
            A+
          </button>
        </div>

        {/* Форма, отступ и начертание */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ shape: isEllipse ? "rect" : "ellipse" })}
            className={[
              "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-medium border transition-colors",
              isEllipse
                ? "border-indigo-500 bg-indigo-600/30 text-indigo-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200",
            ].join(" ")}
            title={`Форма [${BUBBLE_HOTKEYS.toggleShape.label}]: Овал / Прямоугольник`}
          >
            {isEllipse ? <CircleDot className="h-3 w-3 text-indigo-400" /> : <Square className="h-3 w-3" />}
            {isEllipse ? `Oval [${BUBBLE_HOTKEYS.toggleShape.label}]` : `Rect [${BUBBLE_HOTKEYS.toggleShape.label}]`}
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
            title={`Режим отступа [${BUBBLE_HOTKEYS.togglePadding.label}]: Fit (в край) / Safe (запас)`}
          >
            {isFit ? <Maximize2 className="h-3 w-3 text-emerald-400" /> : <Shield className="h-3 w-3" />}
            {isFit ? `Fit [${BUBBLE_HOTKEYS.togglePadding.label}]` : `Safe [${BUBBLE_HOTKEYS.togglePadding.label}]`}
          </button>

          <button
            type="button"
            onClick={() => onChange({ isBold: !block.isBold })}
            className={[
              "p-1 rounded transition-colors",
              block.isBold ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800",
            ].join(" ")}
            title={`Жирный [${BUBBLE_HOTKEYS.toggleBold.label}]`}
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
            title={`Курсив [${BUBBLE_HOTKEYS.toggleItalic.label}]`}
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
            title={`Все заглавные [${BUBBLE_HOTKEYS.toggleUppercase.label}]`}
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
            title={`Белая обводка [${BUBBLE_HOTKEYS.toggleStroke.label}]`}
          >
            Stroke [{BUBBLE_HOTKEYS.toggleStroke.label}]
          </button>
        </div>
      </div>
    </div>
  )
}
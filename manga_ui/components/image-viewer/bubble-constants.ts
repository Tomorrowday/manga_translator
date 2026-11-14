// manga_ui/components/image-viewer/bubble-constants.ts
// Константы оверлея баблов: 8 точек ресайза и цветовые темы классов (речь, мысли, текст, звук)

import type { ResizeDirection } from "@/hooks/use-box-transform"

export const RESIZE_HANDLES: Array<{
  dir: ResizeDirection
  cursor: string
  className: string
}> = [
  { dir: "nw", cursor: "cursor-nwse-resize", className: "-top-1.5 -left-1.5" },
  { dir: "n", cursor: "cursor-ns-resize", className: "-top-1.5 left-1/2 -translate-x-1/2" },
  { dir: "ne", cursor: "cursor-nesw-resize", className: "-top-1.5 -right-1.5" },
  { dir: "e", cursor: "cursor-ew-resize", className: "top-1/2 -right-1.5 -translate-y-1/2" },
  { dir: "se", cursor: "cursor-nwse-resize", className: "-bottom-1.5 -right-1.5" },
  { dir: "s", cursor: "cursor-ns-resize", className: "-bottom-1.5 left-1/2 -translate-x-1/2" },
  { dir: "sw", cursor: "cursor-nesw-resize", className: "-bottom-1.5 -left-1.5" },
  { dir: "w", cursor: "cursor-ew-resize", className: "top-1/2 -left-1.5 -translate-y-1/2" },
]

export const CLASS_THEMES = {
  0: {
    label: "Б",
    title: "Бабл речи",
    border: "border-emerald-500",
    bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
    stroke: "#10b981",
    fill: "rgba(16, 185, 129, 0.10)",
    badgeBg: "bg-emerald-600 text-white shadow-emerald-950/50",
  },
  1: {
    label: "М",
    title: "Мысли",
    border: "border-sky-500",
    bg: "bg-sky-500/10 hover:bg-sky-500/20",
    stroke: "#0ea5e9",
    fill: "rgba(14, 165, 233, 0.10)",
    badgeBg: "bg-sky-600 text-white shadow-sky-950/50",
  },
  2: {
    label: "Т",
    title: "Текст (Free Text)",
    border: "border-purple-500",
    bg: "bg-purple-500/10 hover:bg-purple-500/20",
    stroke: "#a855f7",
    fill: "rgba(168, 85, 247, 0.10)",
    badgeBg: "bg-purple-600 text-white shadow-purple-950/50",
  },
  3: {
    label: "З",
    title: "Звук (SFX)",
    border: "border-orange-600",
    bg: "bg-orange-600/10 hover:bg-orange-600/20",
    stroke: "#ea580c",
    fill: "rgba(234, 88, 12, 0.12)",
    badgeBg: "bg-amber-800 text-orange-200 shadow-amber-950/50 border border-orange-500/40",
  },
} as const

export type BubbleClassId = keyof typeof CLASS_THEMES

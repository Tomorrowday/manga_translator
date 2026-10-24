// manga_ui/hooks/use-brush-tool.ts
/**
 * Контракт хука кисти ретуши и очистки (холст, мазки, экспорт маски).
 * Реализация: manga_ui/hooks/use-brush-tool_impl.ts
 * Зависимости реализации: react (useRef, useState, useCallback, useEffect), HTMLCanvasElement
 */

import { useBrushTool as useBrushToolImpl } from "./use-brush-tool_impl"

export type BrushMode = "lama" | "white" | "black"

export interface UseBrushToolProps {
  imgRef: React.RefObject<HTMLImageElement | null>
  brushSize: number
  brushMode: BrushMode
  imageSrc: string | null
  onBrushClean?: (maskBase64: string, mode: BrushMode) => Promise<void>
}

export interface UseBrushToolReturn {
  brushCanvasRef: React.RefObject<HTMLCanvasElement | null>
  cursorRef: React.RefObject<HTMLDivElement | null>
  isBrushProcessing: boolean
  handleBrushMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleBrushMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleBrushMouseUp: () => Promise<void>
  handleBrushMouseLeave: () => void
}

export function useBrushTool(props: UseBrushToolProps): UseBrushToolReturn {
  return useBrushToolImpl(props)
}
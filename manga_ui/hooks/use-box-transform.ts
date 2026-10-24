// manga_ui/hooks/use-box-transform.ts
/**
 * Контракт хука трансформации баблов (перемещение, 8-точечный ресайз, вращение).
 * Реализация: manga_ui/hooks/use-box-transform_impl.ts
 * Зависимости реализации: react (useState, useEffect, useCallback), @/lib/types (TextBlock)
 */

import type { TextBlock } from "@/lib/types"
import { useBoxTransform as useBoxTransformImpl } from "./use-box-transform_impl"

export type ResizeDirection = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se"
export type EditAction = "move" | "rotate" | ResizeDirection

export interface DrawRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export interface UseBoxTransformReturn {
  isEditing: boolean
  editId: string | null
  editType: EditAction | null
  activeBox: DrawRect | null
  activeRotation: number
  startTransform: (e: React.MouseEvent, box: TextBlock, action: EditAction) => void
}

export function useBoxTransform(
  imgRef: React.RefObject<HTMLImageElement | null>,
  pointFromEvent: (e: React.MouseEvent | MouseEvent) => { x: number; y: number } | null,
  onTransformComplete: (rect: DrawRect, img: HTMLImageElement, id: string, rotation: number) => void
): UseBoxTransformReturn {
  return useBoxTransformImpl(imgRef, pointFromEvent, onTransformComplete)
}
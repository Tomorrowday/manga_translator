// manga_ui/components/image-viewer/bubble-overlay-item.tsx
/**
 * Контракт наложения интерактивного бабла на скан (трансформация, инлайн-редактирование, тайпсет, плашка японского оригинала).
 * Реализация: manga_ui/components/image-viewer/bubble-overlay-item_impl.tsx
 * Зависимости реализации: react, @/lib/types (TextBlock), @/hooks/use-box-transform,
 *                         @/lib/typeset (layoutBubbleTextLines, reflowFromManualLines)
 * Состав реализации: bubble-constants.ts, use-bubble-screen-layout.ts, bubble-inline-editor.tsx,
 *                    bubble-resize-handles.tsx, bubble-jap-tooltip.tsx,
 *                    bubble-typeset-view.tsx, bubble-color-frame-view.tsx
 */

import type React from "react"
import type { TextBlock } from "@/lib/types"
import type { EditAction, DrawRect } from "@/hooks/use-box-transform"

export interface BubbleOverlayItemProps {
  box: TextBlock
  index: number
  titleId?: number | null
  isSelected: boolean
  showTypeset: boolean
  showJapOverlay?: boolean
  imgElement: HTMLImageElement | null
  isEditingCurrent: boolean
  editType: EditAction | null
  activeBox: DrawRect | null
  activeRotation: number
  defaultFontSize?: number
  onStartTransform: (e: React.MouseEvent, box: TextBlock, action: EditAction) => void
  onSelect: (id: string) => void
  onUpdate?: (id: string, patch: Partial<TextBlock>) => void
}

export { BubbleOverlayItem } from "./bubble-overlay-item_impl"
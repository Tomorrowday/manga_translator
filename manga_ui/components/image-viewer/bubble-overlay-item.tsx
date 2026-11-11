// manga_ui/components/image-viewer/bubble-overlay-item.tsx
/**
 * Контракт наложения интерактивного бабла на скан (трансформация, инлайн-редактирование, тайпсет, плашка японского оригинала).
 * Реализация: manga_ui/components/image-viewer/bubble-overlay-item_impl.tsx
 * Зависимости реализации: react, lucide-react (RotateCw), @/lib/types (TextBlock),
 *                         @/lib/typeset (layoutBubbleTextLines), @/hooks/use-box-transform
 */

import type React from "react"
import type { TextBlock } from "@/lib/types"
import type { EditAction, DrawRect } from "@/hooks/use-box-transform"

export interface BubbleOverlayItemProps {
  box: TextBlock
  index: number
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
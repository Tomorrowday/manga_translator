// manga_ui/components/text-block-card/block-card-header.tsx
/**
 * Контракт верхней строки карточки бабла: индекс, смена класса, OCR, бейджи TR/Oval,
 * сброс угла, Speaker, точечная очистка, перемещение и удаление.
 * Реализация: manga_ui/components/text-block-card/block-card-header_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types (TextBlock), @/lib/api (runOcr),
 *                         @/hooks/use-manga-hotkeys, ./spot-clean-controls
 */

import type { TextBlock } from "@/lib/types"

export interface BlockCardHeaderProps {
  block: TextBlock
  index: number
  pageId?: number
  autoOvalBubble?: boolean
  onChange: (patch: Partial<TextBlock>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onSpotClean?: (method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
}

export { BlockCardHeader } from "./block-card-header_impl"

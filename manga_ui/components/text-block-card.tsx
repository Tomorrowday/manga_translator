// manga_ui/components/text-block-card.tsx
/**
 * Контракт карточки текстового блока (бабла) в списке.
 * Реализация: manga_ui/components/text-block-card_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types, @/lib/api (runOcr),
 *                         @/lib/api/dictionary, @/components/image-viewer/tokenized-bubble-text,
 *                         @/hooks/use-manga-hotkeys, @/components/text-block-card/bubble-style-controls
 */

import type { TextBlock } from "@/lib/types"

export interface TextBlockCardProps {
  block: TextBlock
  index: number
  pageId?: number
  titleId?: number | null
  showJapOverlay?: boolean
  defaultFontSize?: number
  autoOvalBubble?: boolean
  isSelected: boolean
  onSelect: () => void
  onChange: (patch: Partial<TextBlock>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onSpotClean?: (method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
}

export { TextBlockCard } from "./text-block-card_impl"
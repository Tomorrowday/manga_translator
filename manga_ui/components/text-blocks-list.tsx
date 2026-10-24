// manga_ui/components/text-blocks-list.tsx
/**
 * Контракт списка текстовых баблов текущей страницы.
 * Реализация: manga_ui/components/text-blocks-list_impl.tsx
 * Зависимости реализации: react, lucide-react (BookText, Layers), @/lib/types, @/components/text-block-card
 */

import type { TextBlock, PageItem } from "@/lib/types"

export interface TextBlocksListProps {
  currentPage: PageItem | null
  textBlocks: TextBlock[]
  selectedId: string | null
  defaultFontSize?: number
  autoOvalBubble?: boolean
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<TextBlock>) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onSpotClean: (block: TextBlock, method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
}

export { TextBlocksList } from "./text-blocks-list_impl"
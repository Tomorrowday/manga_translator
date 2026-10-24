// manga_ui/components/text-block-card/bubble-style-controls.tsx
/**
 * Контракт панели управления стилями текста и бабла (шрифты, кегль, форма, обводка, цвет).
 * Реализация: manga_ui/components/text-block-card/bubble-style-controls_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types (TextBlock), @/lib/hotkeys, @/hooks/use-manga-hotkeys
 */

import type { TextBlock } from "@/lib/types"

export interface BubbleStyleControlsProps {
  block: TextBlock
  defaultFontSize?: number
  onChange: (patch: Partial<TextBlock>) => void
}

export { BubbleStyleControls } from "./bubble-style-controls_impl"
// manga_ui/components/text-block-card/spot-clean-controls.tsx
/**
 * Контракт кнопок точечной очистки бабла (White, LaMa, с удалением рамки).
 * Реализация: manga_ui/components/text-block-card/spot-clean-controls_impl.tsx
 * Зависимости реализации: react, lucide-react, @/hooks/use-manga-hotkeys
 */

export interface SpotCleanControlsProps {
  onSpotClean?: (method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
}

export { SpotCleanControls } from "./spot-clean-controls_impl"
// manga_ui/components/hotkeys-modal.tsx
/**
 * Контракт диалогового окна настройки горячих клавиш.
 * Реализация: manga_ui/components/hotkeys-modal_impl.tsx
 * Зависимости реализации: react, react-dom (createPortal), lucide-react, @/lib/hotkeys, @/hooks/use-manga-hotkeys
 */

export interface HotkeysModalProps {
  onClose: () => void
}

export { HotkeysModal } from "./hotkeys-modal_impl"
// manga_ui/components/settings-modal.tsx
/**
 * Контракт окна глобальных настроек приложения (тогглы, параметры моделей, шрифты, статус Ollama).
 * Реализация: manga_ui/components/settings-modal_impl.tsx
 * Зависимости реализации: react, react-dom (createPortal), lucide-react, @/lib/types,
 *                         @/lib/hotkeys, @/lib/api/projects, @/lib/api/ollama
 */

import type { TitleSettings } from "@/lib/types"

export interface SettingsModalProps {
  onClose: () => void
  onSettingsUpdated?: (newSettings: Partial<TitleSettings>) => void
}

export { SettingsModal } from "./settings-modal_impl"
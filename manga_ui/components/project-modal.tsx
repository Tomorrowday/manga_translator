// manga_ui/components/project-modal.tsx
/**
 * Контракт модального окна управления глоссарием, синопсисом и статистикой проекта.
 * Реализация: manga_ui/components/project-modal_impl.tsx
 * Зависимости реализации: react, react-dom (createPortal), lucide-react, @/lib/types, @/lib/api
 */

export interface ProjectModalProps {
  titleId: number
  titleName: string
  initialTab?: "glossary" | "synopsis" | "stats"
  onClose: () => void
  onSettingsUpdated?: (newDescription: string) => void
}

export { ProjectModal } from "./project-modal_impl"
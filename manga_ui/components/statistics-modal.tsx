// manga_ui/components/statistics-modal.tsx
/**
 * Контракт модального окна расширенной статистики тайтлов и глав.
 * Реализация: manga_ui/components/statistics-modal_impl.tsx
 * Зависимости реализации: react, react-dom (createPortal), lucide-react, @/lib/api
 */

export interface StatisticsModalProps {
  onClose: () => void
  currentChapterId?: number | null
}

export { StatisticsModal } from "./statistics-modal_impl"
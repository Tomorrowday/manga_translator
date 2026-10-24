// manga_ui/components/sidebar/sidebar-modals.tsx
/**
 * Контракт модальных окон сканирования проекта и добавления главы в тайтл.
 * Реализация: manga_ui/components/sidebar/sidebar-modals_impl.tsx
 * Зависимости реализации: react (useState), lucide-react (Loader2)
 */

export interface SidebarModalsProps {
  showScanModal: boolean
  showAddChapterModal: boolean
  selectedProjectName?: string
  onCloseScanModal: () => void
  onCloseAddChapterModal: () => void
  onScanProject: (name: string, path: string) => Promise<boolean>
  onAddChapter: (path: string, chapterNumber?: string) => Promise<boolean>
}

export { SidebarModals } from "./sidebar-modals_impl"
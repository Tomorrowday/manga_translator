// manga_ui/components/image-viewer.tsx
/**
 * Контракт вьювера страницы манги (разметка баблов, масштабирование, ретушь кистью, режим проверки японского текста).
 * Реализация: manga_ui/components/image-viewer_impl.tsx
 * Зависимости реализации: react, lucide-react, @/lib/types (TextBlock), @/lib/api/pages (releaseVram),
 *                         @/hooks/use-manga-hotkeys, @/hooks/use-box-transform,
 *                         @/hooks/use-brush-tool, @/components/image-viewer/bubble-overlay-item,
 *                         @/components/image-viewer/viewer-header-toolbar,
 *                         @/components/image-viewer/viewer-footer-hints
 */

import type { TextBlock } from "@/lib/types"
import type { DrawRect } from "@/hooks/use-box-transform"
import type { BrushMode } from "@/hooks/use-brush-tool"

export interface ImageViewerProps {
  imageSrc: string | null
  textBlocks: TextBlock[]
  selectedId: string | null
  titleId?: number | null
  showTypeset?: boolean
  showJapOverlay: boolean
  pageNumber?: number
  hasCleanScan?: boolean
  viewMode: "original" | "clean"
  defaultFontSize?: number
  brushSize: number
  onBrushResize: (delta: number) => void
  onToggleViewMode: () => void
  onSelect: (id: string | null) => void
  onDrawComplete: (rect: DrawRect, img: HTMLImageElement, existingId?: string, rotation?: number) => void
  onUpdateBlock?: (id: string, patch: Partial<TextBlock>) => void
  onBrushClean?: (maskBase64: string, mode: BrushMode) => Promise<void>
}

export { ImageViewer } from "./image-viewer_impl"
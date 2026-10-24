// manga_ui/hooks/use-page-pipelines.ts
/**
 * Контракт хука конвейеров обработки страницы (AutoDetect, Clean, Translate, Export, FullAuto).
 * Реализация: manga_ui/hooks/use-page-pipelines_impl.ts
 * Зависимости реализации: react, @/lib/types, @/lib/typeset, @/lib/api, @/lib/api/ollama
 */

import type { PageItem, PageStatus, TextBlock, TitleSettings } from "@/lib/types"
import { usePagePipelines as usePagePipelinesImpl } from "./use-page-pipelines_impl"

export interface UsePagePipelinesProps {
  currentPage: PageItem | null
  setCurrentPage: React.Dispatch<React.SetStateAction<PageItem | null>>
  textBlocks: TextBlock[]
  setTextBlocks: React.Dispatch<React.SetStateAction<TextBlock[]>>
  textBlocksRef: React.MutableRefObject<TextBlock[]>
  globalSettings: TitleSettings
  setSelectedId: (id: string | null) => void
  saveBlocks: (refreshSpeakers?: boolean) => Promise<void>
  onPageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void
  setShowTypeset: (show: boolean) => void
  setViewMode: (mode: "original" | "clean") => void
  cleanCacheBuster: number
}

export interface UsePagePipelinesReturn {
  isDetecting: boolean
  isOcrRunning: boolean
  isBatchTranslating: boolean
  isCleaning: boolean
  isRevertingClean: boolean
  isFullAuto: boolean
  isExporting: boolean
  isExportSuccess: boolean
  handleAutoDetect: () => Promise<void>
  handleOcrAllBlocks: () => Promise<void>
  handleTranslateAll: () => Promise<void>
  handleCleanPage: (mode?: "auto" | "lama" | "white") => Promise<void>
  handleRevertClean: () => Promise<void>
  handleExportPage: () => Promise<void>
  handleFullAuto: () => Promise<void>
}

export function usePagePipelines(props: UsePagePipelinesProps): UsePagePipelinesReturn {
  return usePagePipelinesImpl(props)
}
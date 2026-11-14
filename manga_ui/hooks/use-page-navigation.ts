// manga_ui/hooks/use-page-navigation.ts
// Переключение страниц главы: выбор страницы, предыдущая/следующая, защита от гонок

import { useRef, useCallback } from "react"
import type { PageItem, PageStatus, TextBlock, TitleSettings } from "@/lib/types"
import { mapDbBlockToTextBlock } from "@/lib/typeset"
import { getPageDetails, getPageBlocks, runPageAutoDetect } from "@/lib/api"

export interface UsePageNavigationProps {
  currentPage: PageItem | null
  chapterPages: PageItem[]
  setCurrentPage: React.Dispatch<React.SetStateAction<PageItem | null>>
  setCurrentTitleId: (titleId: number) => void
  setViewMode: (mode: "original" | "clean") => void
  setCleanCacheBuster: (value: number) => void
  globalSettings: TitleSettings
  saveBlocksExplicit: (targetPageId: number, blocksToSave: TextBlock[], refreshSpeakers?: boolean) => Promise<void>
  isDirtyRef: React.MutableRefObject<boolean>
  textBlocksRef: React.MutableRefObject<TextBlock[]>
  clearBlocks: () => void
  setNewPageBlocks: (newBlocks: TextBlock[]) => void
  setSelectedId: (id: string | null) => void
  onPageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void
  onRefreshSpeakers: (pageId: number) => Promise<void>
}

export interface UsePageNavigationReturn {
  handleSelectPage: (page: PageItem, skipSave?: boolean) => Promise<void>
  handlePrevPage: () => Promise<void>
  handleNextPage: () => Promise<void>
  currentPageIdx: number
}

export function usePageNavigation({
  currentPage,
  chapterPages,
  setCurrentPage,
  setCurrentTitleId,
  setViewMode,
  setCleanCacheBuster,
  globalSettings,
  saveBlocksExplicit,
  isDirtyRef,
  textBlocksRef,
  clearBlocks,
  setNewPageBlocks,
  setSelectedId,
  onPageStatusUpdate,
  onRefreshSpeakers,
}: UsePageNavigationProps): UsePageNavigationReturn {
  const chapterPagesRef = useRef<PageItem[]>([])
  chapterPagesRef.current = chapterPages
  const isSwitchingPageRef = useRef(false)

  const currentPageIdx = chapterPages.findIndex((p) => p.id === currentPage?.id)

  const handleSelectPage = async (page: PageItem, skipSave = false) => {
    if (isSwitchingPageRef.current) return
    isSwitchingPageRef.current = true

    try {
      if (!skipSave && currentPage && isDirtyRef.current) {
        try {
          await saveBlocksExplicit(currentPage.id, textBlocksRef.current, false)
        } catch (e) {
          console.warn("Не удалось сохранить предыдущую страницу:", e)
        }
      }

      clearBlocks()

      const freshPage = (await getPageDetails(page.id)) || page
      setCurrentPage(freshPage)
      if (freshPage.title_id) {
        setCurrentTitleId(freshPage.title_id)
      }
      setViewMode(freshPage.clean_path ? "clean" : "original")
      setCleanCacheBuster(Date.now())
      onRefreshSpeakers(freshPage.id)

      const dbBlocks = await getPageBlocks(page.id)

      if (dbBlocks && dbBlocks.length > 0) {
        const loaded: TextBlock[] = dbBlocks.map((b: any) => mapDbBlockToTextBlock(b))
        setNewPageBlocks(loaded)
        setSelectedId(loaded[0]?.id || null)
      } else {
        const isFreshPage = freshPage.status === "raw" || freshPage.status === "new"
        if (isFreshPage) {
          const detectRes = await runPageAutoDetect(
            page.id,
            globalSettings.detect_conf,
            false
          )
          if (detectRes?.boxes?.length) {
            const fresh: TextBlock[] = detectRes.boxes.map((box: any) => {
              const mapped = mapDbBlockToTextBlock(box)
              return {
                ...mapped,
                id: box.id !== undefined && box.id !== null ? mapped.id : crypto.randomUUID(),
                fontFamily: box.font_family || globalSettings.font_bubble || mapped.fontFamily,
                paddingMode:
                  (box.padding_mode as TextBlock["paddingMode"]) ||
                  globalSettings.default_padding ||
                  mapped.paddingMode,
                minHyphens:
                  box.min_hyphens !== undefined
                    ? Boolean(box.min_hyphens)
                    : (globalSettings.default_hyphenation ?? mapped.minHyphens),
              }
            })
            setNewPageBlocks(fresh)
            if (fresh[0]) setSelectedId(fresh[0].id)
            onPageStatusUpdate(page.id, "detected")
          } else {
            setNewPageBlocks([])
            onPageStatusUpdate(page.id, "detected")
          }
        } else {
          setNewPageBlocks([])
        }
      }
    } catch (e) {
      console.error("Ошибка при переключении страницы:", e)
      setNewPageBlocks([])
    } finally {
      isSwitchingPageRef.current = false
    }
  }

  const handlePrevPage = useCallback(async () => {
    if (currentPageIdx > 0) {
      const prev = chapterPagesRef.current[currentPageIdx - 1]
      if (prev) await handleSelectPage(prev, false)
    }
  }, [currentPageIdx])

  const handleNextPage = useCallback(async () => {
    if (currentPageIdx >= 0 && currentPageIdx < chapterPagesRef.current.length - 1) {
      const next = chapterPagesRef.current[currentPageIdx + 1]
      if (next) await handleSelectPage(next, false)
    }
  }, [currentPageIdx])

  return { handleSelectPage, handlePrevPage, handleNextPage, currentPageIdx }
}

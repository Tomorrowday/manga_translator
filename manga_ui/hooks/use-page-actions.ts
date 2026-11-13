// manga_ui/hooks/use-page-actions.ts
// Действия над текущей страницей: кисть, OCR одного блока, экспорт JSON, смена класса бабла

import { useCallback } from "react"
import type { PageItem, PageStatus, TextBlock, TitleSettings } from "@/lib/types"
import { exportChapterScriptToFolder, resetChapterBubbleFonts, runBrushClean, runOcr } from "@/lib/api"

export interface UsePageActionsProps {
  currentPage: PageItem | null
  chapterPages: PageItem[]
  titleFontSize: number
  globalSettings: TitleSettings
  selectedId: string | null
  textBlocksRef: React.MutableRefObject<TextBlock[]>
  updateBlock: (id: string, patch: Partial<TextBlock>) => void
  setTextBlocks: React.Dispatch<React.SetStateAction<TextBlock[]>>
  setViewMode: React.Dispatch<React.SetStateAction<"original" | "clean">>
  setCleanCacheBuster: (value: number) => void
  setShowTypeset: React.Dispatch<React.SetStateAction<boolean>>
  setShowJapOverlay: React.Dispatch<React.SetStateAction<boolean>>
  setBrushSize: React.Dispatch<React.SetStateAction<number>>
  setIsApplyingChapterFont: React.Dispatch<React.SetStateAction<boolean>>
  recordCleanAction: () => void
  handlePageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void
}

export interface UsePageActionsReturn {
  handleBrushClean: (maskBase64: string, mode?: "lama" | "white" | "black") => Promise<void>
  handleOcrSingleBlock: (block: TextBlock) => Promise<void>
  handleSetBlockClass: (classId: number) => void
  handleChapterExportJson: () => Promise<void>
  handleApplyFontSizeToChapter: () => Promise<void>
  handleBrushResize: (delta: number) => void
  handleToggleViewMode: () => void
  handleToggleTypeset: () => void
  handleToggleJapOverlay: () => void
}

export function usePageActions({
  currentPage,
  chapterPages,
  titleFontSize,
  globalSettings,
  selectedId,
  textBlocksRef,
  updateBlock,
  setTextBlocks,
  setViewMode,
  setCleanCacheBuster,
  setShowTypeset,
  setShowJapOverlay,
  setBrushSize,
  setIsApplyingChapterFont,
  recordCleanAction,
  handlePageStatusUpdate,
}: UsePageActionsProps): UsePageActionsReturn {
  const handleBrushClean = useCallback(
    async (maskBase64: string, mode: "lama" | "white" | "black" = "lama") => {
      if (!currentPage) return
      try {
        recordCleanAction()
        const res = await runBrushClean(currentPage.id, maskBase64, mode)
        if (res.success) {
          handlePageStatusUpdate(currentPage.id, res.page_status || "cleaned", res.clean_path)
          setViewMode("clean")
          setCleanCacheBuster(Date.now())
        } else {
          alert("Ошибка кисти: " + (res.error || "Неизвестная ошибка"))
        }
      } catch (e) {
        console.error("Ошибка применения кисти:", e)
        alert("Ошибка кисти: " + String(e))
      }
    },
    [currentPage, handlePageStatusUpdate, recordCleanAction, setViewMode, setCleanCacheBuster]
  )

  const handleOcrSingleBlock = useCallback(
    async (block: TextBlock) => {
      if (!currentPage) return
      const text = await runOcr(
        currentPage.id,
        block.x,
        block.y,
        block.width,
        block.height,
        block.rotation || 0
      )
      updateBlock(block.id, {
        japText: text,
        status: block.status === "translated" ? "translated" : "ocr-done",
      })
    },
    [currentPage, updateBlock]
  )

  const handleSetBlockClass = useCallback(
    (classId: number) => {
      if (!selectedId) return
      const targetBlock = textBlocksRef.current.find((b) => b.id === selectedId)
      const hasTranslation = Boolean(targetBlock?.rusText && targetBlock.rusText.trim())
      const autoOval = globalSettings.auto_oval_bubble ?? true
      const shape = classId === 0 && autoOval && hasTranslation ? "ellipse" : "rect"

      let fontFamily = globalSettings.font_bubble || "v_CCFaceFront"
      if (classId === 1) fontFamily = globalSettings.font_thought || "v_CCFaceFront"
      if (classId === 2 || classId === 3) fontFamily = globalSettings.font_sfx || "v_Mighty Zeo 2.0"

      updateBlock(selectedId, { class_id: classId, shape, fontFamily })
    },
    [selectedId, globalSettings, updateBlock, textBlocksRef]
  )

  const handleApplyFontSizeToChapter = useCallback(async () => {
    const chId = currentPage?.chapter_id || chapterPages[0]?.chapter_id
    if (!chId) return

    const ok = confirm(`Сбросить все баблы текущей главы в режим Auto под кегль ${titleFontSize}px?`)
    if (!ok) return

    setIsApplyingChapterFont(true)
    try {
      await resetChapterBubbleFonts(chId)
      setTextBlocks((prev) => prev.map((b) => ({ ...b, fontSize: undefined })))
      alert(`Все баблы главы успешно переведены в режим Auto (${titleFontSize}px)!`)
    } catch (err) {
      alert("Ошибка применения к главе: " + String(err))
    } finally {
      setIsApplyingChapterFont(false)
    }
  }, [currentPage?.chapter_id, chapterPages, titleFontSize, setTextBlocks, setIsApplyingChapterFont])

  const handleChapterExportJson = useCallback(async () => {
    const chId = chapterPages[0]?.chapter_id
    if (!chId) return
    try {
      const res = await exportChapterScriptToFolder(chId)
      alert(`Скрипты диалогов и контекста сохранены:\n${res.saved_path}`)
    } catch (e) {
      alert("Ошибка экспорта JSON: " + String(e))
    }
  }, [chapterPages])

  const handleBrushResize = useCallback((delta: number) => {
    setBrushSize((prev) => Math.max(6, Math.min(160, prev + delta)))
  }, [setBrushSize])

  const handleToggleViewMode = useCallback(() => {
    if (currentPage?.clean_path) {
      setViewMode((prev) => (prev === "original" ? "clean" : "original"))
    }
  }, [currentPage?.clean_path, setViewMode])

  const handleToggleTypeset = useCallback(() => {
    setShowTypeset((prev) => !prev)
  }, [setShowTypeset])

  const handleToggleJapOverlay = useCallback(() => {
    setShowJapOverlay((prev) => !prev)
  }, [setShowJapOverlay])

  return {
    handleBrushClean,
    handleOcrSingleBlock,
    handleSetBlockClass,
    handleChapterExportJson,
    handleApplyFontSizeToChapter,
    handleBrushResize,
    handleToggleViewMode,
    handleToggleTypeset,
    handleToggleJapOverlay,
  }
}

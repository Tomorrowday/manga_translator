"use client"

import { useState, useCallback, useRef } from "react"
import type { PageItem, PageStatus } from "@/lib/types"
import { ImageViewer } from "@/components/image-viewer"
import { Sidebar } from "@/components/sidebar"
import { BatchChapterActions } from "@/components/batch-chapter-actions"
import { TranslatorHeader } from "@/components/translator-header"
import { TranslationToolbar } from "@/components/translation-toolbar"
import { TextBlocksList } from "@/components/text-blocks-list"
import { cropRegion, mapDbBlockToTextBlock } from "@/lib/typeset"
import { useMangaHotkeys } from "@/hooks/use-manga-hotkeys"
import { usePageBlocks } from "@/hooks/use-page-blocks"
import { usePagePipelines } from "@/hooks/use-page-pipelines"
import {
  getPageDetails,
  getPageSpeakers,
  getPageImageUrl,
  getPageCleanImageUrl,
  getPageBlocks,
  runPageAutoDetect,
  openTranslatedFolder,
  runBrushClean,
} from "@/lib/api/pages"
import { getProjectTree } from "@/lib/api/projects"

export function MangaTranslator() {
  const [currentPage, setCurrentPage] = useState<PageItem | null>(null)
  const [chapterPages, setChapterPages] = useState<PageItem[]>([])
  const [viewMode, setViewMode] = useState<"original" | "clean">("original")
  const [cleanCacheBuster, setCleanCacheBuster] = useState<number>(Date.now())
  const [showTypeset, setShowTypeset] = useState(false)

  // Базовый размер шрифта для текущей выбранной манги (тайтла)
  const [titleDefaultFontSize, setTitleDefaultFontSize] = useState<number>(14)

  const [knownSpeakers, setKnownSpeakers] = useState<string[]>([])
  const [activePageUpdate, setActivePageUpdate] = useState<{ id: number; status: PageStatus; clean_path?: string } | null>(null)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)

  const chapterPagesRef = useRef<PageItem[]>([])
  chapterPagesRef.current = chapterPages

  const isSwitchingPageRef = useRef(false)

  const refreshSpeakersList = useCallback(async (pageId: number) => {
    try {
      const speakers = await getPageSpeakers(pageId)
      if (speakers?.length) setKnownSpeakers(speakers)
    } catch (e) {
      console.error("Ошибка спикеров:", e)
    }
  }, [])

  const handlePageStatusUpdate = useCallback((pageId: number, status: PageStatus, cleanPath?: string) => {
    setActivePageUpdate({ id: pageId, status, clean_path: cleanPath })
    setCurrentPage((prev) => {
      if (!prev || prev.id !== pageId) return prev
      return { ...prev, status, clean_path: cleanPath !== undefined ? cleanPath : prev.clean_path }
    })
    if (cleanPath) {
      setCleanCacheBuster(Date.now())
      setViewMode("clean")
    }
  }, [])

  const {
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    selectedId,
    setSelectedId,
    isSaving,
    isDirtyRef,
    saveBlocks,
    saveBlocksExplicit,
    setNewPageBlocks,
    clearBlocks,
    updateBlock,
    deleteBlock,
    moveBlock,
    spotCleanBlock,
    addOrUpdateDrawnBlock,
  } = usePageBlocks(currentPage, handlePageStatusUpdate, refreshSpeakersList)

  const pipelines = usePagePipelines({
    currentPage,
    setCurrentPage,
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    defaultFontSize: titleDefaultFontSize,
    setSelectedId,
    saveBlocks,
    onPageStatusUpdate: handlePageStatusUpdate,
    setShowTypeset,
    setViewMode,
    cleanCacheBuster,
  })

  const handleChapterDeleted = useCallback((deletedChapterId: number) => {
    if (currentPage?.chapter_id === deletedChapterId) {
      clearBlocks()
      setCurrentPage(null)
      setChapterPages([])
    }
  }, [currentPage?.chapter_id, clearBlocks])

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
      setViewMode(freshPage.clean_path ? "clean" : "original")
      setCleanCacheBuster(Date.now())
      refreshSpeakersList(freshPage.id)

      // Загружаем базовый размер шрифта для тайтла страницы
      if (freshPage.title_id) {
        try {
          const tree = await getProjectTree(freshPage.title_id)
          if (tree?.default_font_size) {
            setTitleDefaultFontSize(tree.default_font_size)
          }
        } catch (err) {
          console.warn("Не удалось загрузить настройки тайтла:", err)
        }
      }

      const rawUrl = getPageImageUrl(page.id)
      const dbBlocks = await getPageBlocks(page.id)
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = rawUrl
      await new Promise((res) => {
        if (img.complete && img.naturalWidth > 0) res(true)
        else {
          img.onload = () => res(true)
          img.onerror = () => res(false)
        }
      })

      if (dbBlocks && dbBlocks.length > 0) {
        const loaded = []
        for (const b of dbBlocks) {
          const cropped = img.naturalWidth > 0 ? await cropRegion(img, { ...b, rotation: b.rotation || 0 }) : { dataUrl: "" }
          loaded.push(mapDbBlockToTextBlock(b, cropped.dataUrl))
        }
        setNewPageBlocks(loaded)
        setSelectedId(loaded[0]?.id || null)
      } else {
        const isFreshPage = freshPage.status === "raw" || freshPage.status === "new"
        if (isFreshPage) {
          const detectRes = await runPageAutoDetect(page.id)
          if (detectRes?.boxes?.length) {
            const fresh = []
            for (const box of detectRes.boxes) {
              const cropped = await cropRegion(img, { ...box, rotation: 0 })
              fresh.push({
                id: box.id || crypto.randomUUID(),
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                rotation: 0,
                imageCrop: cropped.dataUrl,
                japText: box.jap_text || "",
                rusText: "",
                orderIndex: box.order_index,
                textColor: "black" as const,
                shape: "rect" as const,
                paddingMode: "safe" as const,
                minHyphens: true,
                status: (box.status as any) || (box.jap_text ? "ocr-done" : "new"),
              })
            }
            setNewPageBlocks(fresh)
            if (fresh[0]) setSelectedId(fresh[0].id)
            handlePageStatusUpdate(page.id, "detected")
          } else {
            setNewPageBlocks([])
            handlePageStatusUpdate(page.id, "detected")
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

  const handleBrushClean = useCallback(
    async (maskBase64: string, mode: "lama" | "white" | "black" = "lama") => {
      if (!currentPage) return
      try {
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
    [currentPage, handlePageStatusUpdate]
  )

  const currentPageIdx = chapterPages.findIndex((p) => p.id === currentPage?.id)

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

  useMangaHotkeys({
    selectedId,
    textBlocks,
    defaultFontSize: titleDefaultFontSize,
    onPrevPage: handlePrevPage,
    onNextPage: handleNextPage,
    onSave: () => saveBlocks(true),
    onDeleteBlock: deleteBlock,
    onMoveBlock: moveBlock,
    onUpdateBlock: updateBlock,
    onSpotClean: spotCleanBlock,
  })

  const translatedCount = textBlocks.filter((b) => b.status === "translated").length
  const currentSpeakers = textBlocks.map((b) => b.speaker?.trim()).filter((s): s is string => !!s)
  const allSpeakerSuggestions = Array.from(new Set([...knownSpeakers, ...currentSpeakers])).sort()

  const activeImageSrc = currentPage
    ? viewMode === "clean" && currentPage.clean_path
      ? `${getPageCleanImageUrl(currentPage.id)}?t=${cleanCacheBuster}`
      : getPageImageUrl(currentPage.id)
    : null

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <datalist id="manga-speakers">
        {allSpeakerSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <TranslatorHeader
        currentPage={currentPage}
        currentIndex={currentPageIdx}
        totalPages={chapterPages.length}
        totalBlocks={textBlocks.length}
        translatedCount={translatedCount}
        isSaving={isSaving}
        isExporting={pipelines.isExporting}
        isExportSuccess={pipelines.isExportSuccess}
        onOpenFolder={() => currentPage && openTranslatedFolder(currentPage.id)}
        onExportPage={pipelines.handleExportPage}
        onSaveBlocks={() => saveBlocks(true)}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
      />

      <BatchChapterActions
        pages={chapterPages}
        currentPageId={currentPage?.id ?? null}
        titleDefaultFontSize={titleDefaultFontSize}
        onSaveCurrentPage={() => saveBlocks(true)}
        onPageStatusUpdate={handlePageStatusUpdate}
        onCompleteBatch={() => setSidebarRefreshTrigger((prev) => prev + 1)}
        onRefreshCurrent={() => {
          if (currentPage) handleSelectPage(currentPage, true)
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          currentPageId={currentPage?.id || null}
          activePageUpdate={activePageUpdate}
          refreshTrigger={sidebarRefreshTrigger}
          onSelectPage={(page) => handleSelectPage(page, false)}
          onActiveChapterChange={setChapterPages}
          onChapterDeleted={handleChapterDeleted}
        />

        <ImageViewer
          imageSrc={activeImageSrc}
          textBlocks={textBlocks}
          selectedId={selectedId}
          showTypeset={showTypeset}
          pageNumber={currentPage?.page_number}
          hasCleanScan={Boolean(currentPage?.clean_path)}
          viewMode={viewMode}
          defaultFontSize={titleDefaultFontSize}
          onToggleViewMode={() => setViewMode((prev) => (prev === "original" ? "clean" : "original"))}
          onSelect={setSelectedId}
          onDrawComplete={addOrUpdateDrawnBlock}
          onUpdateBlock={updateBlock}
          onBrushClean={handleBrushClean}
        />

        <section className="flex min-h-0 w-full flex-col border-t border-slate-800 lg:w-2/5 lg:border-l lg:border-t-0">
          <TranslationToolbar
            hasCurrentPage={Boolean(currentPage)}
            hasBlocks={textBlocks.length > 0}
            hasCleanScan={Boolean(currentPage?.clean_path)}
            isFullAuto={pipelines.isFullAuto}
            isDetecting={pipelines.isDetecting}
            isOcrRunning={pipelines.isOcrRunning}
            isBatchTranslating={pipelines.isBatchTranslating}
            isCleaning={pipelines.isCleaning}
            isRevertingClean={pipelines.isRevertingClean}
            showTypeset={showTypeset}
            onFullAuto={pipelines.handleFullAuto}
            onAutoDetect={pipelines.handleAutoDetect}
            onOcrAllBlocks={pipelines.handleOcrAllBlocks}
            onTranslateAll={pipelines.handleTranslateAll}
            onCleanPage={pipelines.handleCleanPage}
            onRevertClean={pipelines.handleRevertClean}
            onToggleTypeset={() => setShowTypeset((prev) => !prev)}
          />

          <TextBlocksList
            currentPage={currentPage}
            textBlocks={textBlocks}
            selectedId={selectedId}
            defaultFontSize={titleDefaultFontSize}
            onSelect={setSelectedId}
            onUpdate={updateBlock}
            onDelete={deleteBlock}
            onMoveUp={(id) => moveBlock(id, "up")}
            onMoveDown={(id) => moveBlock(id, "down")}
            onSpotClean={spotCleanBlock}
          />
        </section>
      </div>
    </div>
  )
}
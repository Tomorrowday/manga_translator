// manga_ui/components/manga-translator.tsx
// Главный контейнер: точная передача тогглов, сохранение четкости моделей и хоткеи

"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { PageItem, PageStatus, TitleSettings } from "@/lib/types"
import { ImageViewer } from "@/components/image-viewer"
import { Sidebar } from "@/components/sidebar"
import { BatchChapterActions } from "@/components/batch-chapter-actions"
import { TranslatorHeader } from "@/components/translator-header"
import { TranslationToolbar } from "@/components/translation-toolbar"
import { TextBlocksList } from "@/components/text-blocks-list"
import { HotkeysModal } from "@/components/hotkeys-modal"
import { SettingsModal } from "@/components/settings-modal"
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
import { getGlobalSettings, exportChapterScriptToFolder } from "@/lib/api"

export function MangaTranslator() {
  const [currentPage, setCurrentPage] = useState<PageItem | null>(null)
  const [chapterPages, setChapterPages] = useState<PageItem[]>([])
  const [viewMode, setViewMode] = useState<"original" | "clean">("original")
  const [cleanCacheBuster, setCleanCacheBuster] = useState<number>(Date.now())
  const [showTypeset, setShowTypeset] = useState(false)
  const [brushSize, setBrushSize] = useState<number>(32)

  // Глобальные настройки приложения
  const [globalSettings, setGlobalSettings] = useState<TitleSettings>({
    default_font_size: 14,
    auto_oval_bubble: true,
    default_padding: "safe",
    default_hyphenation: true,
    font_bubble: "v_CCFaceFront",
    font_thought: "v_CCFaceFront",
    font_sfx: "v_Mighty Zeo 2.0",
  })

  const [knownSpeakers, setKnownSpeakers] = useState<string[]>([])
  const [activePageUpdate, setActivePageUpdate] = useState<{ id: number; status: PageStatus; clean_path?: string } | null>(null)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)

  // Модальные окна
  const [showHotkeysModal, setShowHotkeysModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  const chapterPagesRef = useRef<PageItem[]>([])
  chapterPagesRef.current = chapterPages
  const isSwitchingPageRef = useRef(false)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await getGlobalSettings()
        if (res.success && res.settings) {
          setGlobalSettings(res.settings)
        }
      } catch (err) {
        console.warn("Не удалось загрузить глобальные настройки:", err)
      }
    }
    loadSettings()
  }, [])

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
  } = usePageBlocks(currentPage, globalSettings, handlePageStatusUpdate, refreshSpeakersList)

  const pipelines = usePagePipelines({
    currentPage,
    setCurrentPage,
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    globalSettings,
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
          const isAutoOvalEnabled = globalSettings.auto_oval_bubble ?? true
          const detectRes = await runPageAutoDetect(
            page.id,
            globalSettings.detect_conf,
            isAutoOvalEnabled
          )
          if (detectRes?.boxes?.length) {
            const fresh = []
            for (const box of detectRes.boxes) {
              const cropped = await cropRegion(img, { ...box, rotation: 0 })
              const isBubble = (box.class_id ?? 0) === 0
              const resolvedShape = (isBubble && isAutoOvalEnabled) ? "ellipse" : (box.shape || "rect")

              fresh.push({
                id: box.id || crypto.randomUUID(),
                class_id: box.class_id ?? 0,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                rotation: 0,
                imageCrop: cropped.dataUrl,
                japText: box.jap_text || "",
                rusText: "",
                orderIndex: box.order_index,
                fontSize: box.font_size || globalSettings.default_font_size || 14,
                fontFamily: box.font_family || globalSettings.font_bubble || "v_CCFaceFront",
                textColor: "black" as const,
                shape: resolvedShape,
                paddingMode: box.padding_mode || globalSettings.default_padding || "safe",
                minHyphens: box.min_hyphens !== undefined ? box.min_hyphens : (globalSettings.default_hyphenation ?? true),
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

  const handleBrushResize = useCallback((delta: number) => {
    setBrushSize((prev) => Math.max(6, Math.min(160, prev + delta)))
  }, [])

  const handleToggleViewMode = useCallback(() => {
    if (currentPage?.clean_path) {
      setViewMode((prev) => (prev === "original" ? "clean" : "original"))
    }
  }, [currentPage?.clean_path])

  const handleToggleTypeset = useCallback(() => {
    setShowTypeset((prev) => !prev)
  }, [])

  // Хоткеи C / V / G для типов баблов с учетом тоггла
  const handleSetBlockClass = useCallback(
    (classId: number) => {
      if (!selectedId) return
      const autoOval = globalSettings.auto_oval_bubble ?? true
      const shape = classId === 0 && autoOval ? "ellipse" : "rect"

      let fontFamily = globalSettings.font_bubble || "v_CCFaceFront"
      if (classId === 1) fontFamily = globalSettings.font_thought || "v_CCFaceFront"
      if (classId === 2) fontFamily = globalSettings.font_sfx || "v_Mighty Zeo 2.0"

      updateBlock(selectedId, { class_id: classId, shape, fontFamily })
    },
    [selectedId, globalSettings, updateBlock]
  )

  // Хоткеи действий с главой
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

  useMangaHotkeys({
    selectedId,
    textBlocks,
    defaultFontSize: globalSettings.default_font_size || 14,
    onPrevPage: handlePrevPage,
    onNextPage: handleNextPage,
    onSave: () => saveBlocks(true),
    onToggleViewMode: handleToggleViewMode,
    onToggleTypeset: handleToggleTypeset,
    onSetClass: handleSetBlockClass,
    onDeleteBlock: deleteBlock,
    onMoveBlock: moveBlock,
    onUpdateBlock: updateBlock,
    onSpotClean: spotCleanBlock,
    onBrushResize: handleBrushResize,
    onChapterExportJson: handleChapterExportJson,
  })

  const translatedCount = textBlocks.filter((b) => b.status === "translated" || Boolean(b.rusText?.trim())).length
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
        onOpenHotkeys={() => setShowHotkeysModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      <BatchChapterActions
        pages={chapterPages}
        currentPageId={currentPage?.id ?? null}
        titleDefaultFontSize={globalSettings.default_font_size || 14}
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
          defaultFontSize={globalSettings.default_font_size || 14}
          brushSize={brushSize}
          onBrushResize={handleBrushResize}
          onToggleViewMode={handleToggleViewMode}
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
            onToggleTypeset={handleToggleTypeset}
          />

          <TextBlocksList
            currentPage={currentPage}
            textBlocks={textBlocks}
            selectedId={selectedId}
            defaultFontSize={globalSettings.default_font_size || 14}
            autoOvalBubble={globalSettings.auto_oval_bubble ?? true}
            onSelect={setSelectedId}
            onUpdate={updateBlock}
            onDelete={deleteBlock}
            onMoveUp={(id) => moveBlock(id, "up")}
            onMoveDown={(id) => moveBlock(id, "down")}
            onSpotClean={spotCleanBlock}
          />
        </section>
      </div>

      {showHotkeysModal && <HotkeysModal onClose={() => setShowHotkeysModal(false)} />}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onSettingsUpdated={(newSettings) => {
            setGlobalSettings((prev) => ({ ...prev, ...newSettings }))
          }}
        />
      )}
    </div>
  )
}
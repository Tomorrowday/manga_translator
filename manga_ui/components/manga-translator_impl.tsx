// manga_ui/components/manga-translator_impl.tsx
// Главный контейнер Manga Translator: связывание хуков и JSX-компоновка экранов

"use client"

import { useState, useCallback } from "react"
import type { PageItem } from "@/lib/types"
import { ImageViewer } from "@/components/image-viewer"
import { Sidebar } from "@/components/sidebar"
import { BatchChapterActions } from "@/components/batch-chapter-actions"
import { TranslatorHeader } from "@/components/translator-header"
import { TranslationToolbar } from "@/components/translation-toolbar"
import { TextBlocksList } from "@/components/text-blocks-list"
import { HotkeysModal } from "@/components/hotkeys-modal"
import { SettingsModal } from "@/components/settings-modal"
import { StatisticsModal } from "@/components/statistics-modal"
import { openTranslatedFolder, getPageImageUrl, getPageCleanImageUrl } from "@/lib/api"
import { useMangaHotkeys } from "@/hooks/use-manga-hotkeys"
import { usePageBlocks } from "@/hooks/use-page-blocks"
import { usePagePipelines } from "@/hooks/use-page-pipelines"
import { useChapterTimer } from "@/hooks/use-chapter-timer"
import { usePanelResize } from "@/hooks/use-panel-resize"
import { usePageNavigation } from "@/hooks/use-page-navigation"
import { useMangaSettings } from "@/hooks/use-manga-settings"
import { useMangaPageState } from "@/hooks/use-manga-page-state"
import { usePageActions } from "@/hooks/use-page-actions"
import { useBatchChapterActions } from "@/hooks/use-batch-chapter-actions"
import type { MangaTranslatorProps } from "./manga-translator"

export function MangaTranslator(_props: MangaTranslatorProps) {
  const [currentPage, setCurrentPage] = useState<PageItem | null>(null)
  const [chapterPages, setChapterPages] = useState<PageItem[]>([])
  const [viewMode, setViewMode] = useState<"original" | "clean">("original")
  const [cleanCacheBuster, setCleanCacheBuster] = useState<number>(Date.now())
  const [showTypeset, setShowTypeset] = useState(false)
  const [showJapOverlay, setShowJapOverlay] = useState(false)
  const [brushSize, setBrushSize] = useState<number>(32)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)

  // Модальные окна
  const [showHotkeysModal, setShowHotkeysModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showStatisticsModal, setShowStatisticsModal] = useState(false)

  const currentChapterId = currentPage?.chapter_id || chapterPages[0]?.chapter_id || null

  const { isTimerRunning, timerSeconds, handleStartTimer, handleStopTimer } = useChapterTimer(currentChapterId)
  const { panelWidth, isResizing, startResizing } = usePanelResize()
  const settings = useMangaSettings()
  const pageState = useMangaPageState({ setCurrentPage, setViewMode, setCleanCacheBuster })

  // Глобальные настройки с базовым кеглем текущего тайтла
  const globalSettings = { ...settings.globalSettings, default_font_size: settings.titleFontSize }

  const blocks = usePageBlocks(
    currentPage,
    globalSettings,
    pageState.handlePageStatusUpdate,
    pageState.refreshSpeakersList
  )

  const pipelines = usePagePipelines({
    currentPage,
    setCurrentPage,
    textBlocks: blocks.textBlocks,
    setTextBlocks: blocks.setTextBlocks,
    textBlocksRef: blocks.textBlocksRef,
    globalSettings,
    setSelectedId: blocks.setSelectedId,
    saveBlocks: blocks.saveBlocks,
    onPageStatusUpdate: pageState.handlePageStatusUpdate,
    setShowTypeset,
    setViewMode,
    cleanCacheBuster,
  })

  const navigation = usePageNavigation({
    currentPage,
    chapterPages,
    setCurrentPage,
    setCurrentTitleId: settings.setCurrentTitleId,
    setViewMode,
    setCleanCacheBuster,
    globalSettings,
    saveBlocksExplicit: blocks.saveBlocksExplicit,
    isDirtyRef: blocks.isDirtyRef,
    textBlocksRef: blocks.textBlocksRef,
    clearBlocks: blocks.clearBlocks,
    setNewPageBlocks: blocks.setNewPageBlocks,
    setSelectedId: blocks.setSelectedId,
    onPageStatusUpdate: pageState.handlePageStatusUpdate,
    onRefreshSpeakers: pageState.refreshSpeakersList,
  })

  const actions = usePageActions({
    currentPage,
    chapterPages,
    titleFontSize: settings.titleFontSize,
    globalSettings,
    selectedId: blocks.selectedId,
    textBlocksRef: blocks.textBlocksRef,
    updateBlock: blocks.updateBlock,
    setTextBlocks: blocks.setTextBlocks,
    setViewMode,
    setCleanCacheBuster,
    setShowTypeset,
    setShowJapOverlay,
    setBrushSize,
    setIsApplyingChapterFont: settings.setIsApplyingChapterFont,
    recordCleanAction: blocks.recordCleanAction,
    handlePageStatusUpdate: pageState.handlePageStatusUpdate,
  })

  const handleChapterDeleted = useCallback((deletedChapterId: number) => {
    if (currentPage?.chapter_id === deletedChapterId) {
      blocks.clearBlocks()
      setCurrentPage(null)
      setChapterPages([])
    }
  }, [currentPage?.chapter_id, blocks.clearBlocks])

  // Пакетные действия главы подняты в родителя: одни и те же обработчики
  // используются панелью <BatchChapterActions /> и глобальными хоткеями (Alt+D/C/E/J/I).
  const batchChapterProps = {
    pages: chapterPages,
    currentPageId: currentPage?.id ?? null,
    titleDefaultFontSize: settings.titleFontSize,
    onSaveCurrentPage: () => blocks.saveBlocks(true),
    onPageStatusUpdate: pageState.handlePageStatusUpdate,
    onCompleteBatch: () => setSidebarRefreshTrigger((prev) => prev + 1),
    onRefreshCurrent: () => {
      if (currentPage) navigation.handleSelectPage(currentPage, true)
    },
  }

  const batchActions = useBatchChapterActions(batchChapterProps)

  useMangaHotkeys({
    selectedId: blocks.selectedId,
    textBlocks: blocks.textBlocks,
    defaultFontSize: settings.titleFontSize,
    onPrevPage: navigation.handlePrevPage,
    onNextPage: navigation.handleNextPage,
    onSave: () => blocks.saveBlocks(true),
    onUndo: blocks.undo,
    onRedo: blocks.redo,
    onToggleViewMode: actions.handleToggleViewMode,
    onToggleTypeset: actions.handleToggleTypeset,
    onToggleJapCheck: actions.handleToggleJapOverlay,
    onOcrBlock: actions.handleOcrSingleBlock,
    onSetClass: actions.handleSetBlockClass,
    onDeleteBlock: blocks.deleteBlock,
    onMoveBlock: blocks.moveBlock,
    onUpdateBlock: blocks.updateBlock,
    onSpotClean: blocks.spotCleanBlock,
    onBrushResize: actions.handleBrushResize,
    onChapterDetectAll: batchActions.detectAll,
    onChapterCleanAll: batchActions.cleanChapter,
    onChapterExportAll: batchActions.exportAll,
    onChapterExportJson: batchActions.handleExportScript,
    onChapterImportJson: batchActions.handleImportClick,
  })

  const currentSpeakers = blocks.textBlocks.map((b) => b.speaker?.trim()).filter((s): s is string => !!s)
  const allSpeakerSuggestions = Array.from(new Set([...pageState.knownSpeakers, ...currentSpeakers])).sort()

  const activeImageSrc = currentPage
    ? viewMode === "clean" && currentPage.clean_path
      ? `${getPageCleanImageUrl(currentPage.id)}?t=${cleanCacheBuster}`
      : getPageImageUrl(currentPage.id)
    : null

  return (
    <div className={`flex h-screen flex-col bg-slate-900 text-slate-100 ${isResizing ? "select-none" : ""}`}>
      <datalist id="manga-speakers">
        {allSpeakerSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <TranslatorHeader
        currentPage={currentPage}
        currentIndex={navigation.currentPageIdx}
        totalPages={chapterPages.length}
        currentChapterId={currentChapterId}
        titleFontSize={settings.titleFontSize}
        onTitleFontSizeChange={settings.handleTitleFontSizeChange}
        onApplyFontSizeToChapter={actions.handleApplyFontSizeToChapter}
        isApplyingChapterFont={settings.isApplyingChapterFont}
        isSaving={blocks.isSaving}
        isExporting={pipelines.isExporting}
        isExportSuccess={pipelines.isExportSuccess}
        isTimerRunning={isTimerRunning}
        timerSeconds={timerSeconds}
        onStartTimer={handleStartTimer}
        onStopTimer={handleStopTimer}
        onOpenFolder={() => currentPage && openTranslatedFolder(currentPage.id)}
        onExportPage={pipelines.handleExportPage}
        onSaveBlocks={() => blocks.saveBlocks(true)}
        onPrevPage={navigation.handlePrevPage}
        onNextPage={navigation.handleNextPage}
        onOpenHotkeys={() => setShowHotkeysModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenStatistics={() => setShowStatisticsModal(true)}
      />

      <BatchChapterActions {...batchChapterProps} controller={batchActions} />

      <div className="flex min-h-0 flex-1 overflow-hidden relative">
        <Sidebar
          currentPageId={currentPage?.id || null}
          activePageUpdate={pageState.activePageUpdate}
          refreshTrigger={sidebarRefreshTrigger}
          onSelectPage={(page) => navigation.handleSelectPage(page, false)}
          onActiveChapterChange={setChapterPages}
          onChapterDeleted={handleChapterDeleted}
          onTitleSelected={settings.handleTitleSelected}
        />

        <ImageViewer
          imageSrc={activeImageSrc}
          textBlocks={blocks.textBlocks}
          selectedId={blocks.selectedId}
          showTypeset={showTypeset}
          showJapOverlay={showJapOverlay}
          pageNumber={currentPage?.page_number}
          hasCleanScan={Boolean(currentPage?.clean_path)}
          viewMode={viewMode}
          defaultFontSize={settings.titleFontSize}
          brushSize={brushSize}
          onBrushResize={actions.handleBrushResize}
          onToggleViewMode={actions.handleToggleViewMode}
          onSelect={blocks.setSelectedId}
          onDrawComplete={blocks.addOrUpdateDrawnBlock}
          onUpdateBlock={blocks.updateBlock}
          onBrushClean={actions.handleBrushClean}
        />

        <div
          onMouseDown={startResizing}
          className={[
            "w-1.5 shrink-0 cursor-col-resize select-none transition-colors relative z-30 group",
            isResizing ? "bg-indigo-500" : "bg-slate-800 hover:bg-indigo-500/70",
          ].join(" ")}
          title="Потяните, чтобы изменить ширину правой панели"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        <section
          style={{ width: `${panelWidth}px` }}
          className="flex min-h-0 shrink-0 flex-col overflow-hidden bg-slate-950/60"
        >
          <TranslationToolbar
            hasCurrentPage={Boolean(currentPage)}
            hasBlocks={blocks.textBlocks.length > 0}
            hasCleanScan={Boolean(currentPage?.clean_path)}
            isFullAuto={pipelines.isFullAuto}
            isDetecting={pipelines.isDetecting}
            isOcrRunning={pipelines.isOcrRunning}
            isBatchTranslating={pipelines.isBatchTranslating}
            isCleaning={pipelines.isCleaning}
            isRevertingClean={pipelines.isRevertingClean}
            showTypeset={showTypeset}
            showJapOverlay={showJapOverlay}
            onFullAuto={pipelines.handleFullAuto}
            onAutoDetect={pipelines.handleAutoDetect}
            onOcrAllBlocks={pipelines.handleOcrAllBlocks}
            onTranslateAll={pipelines.handleTranslateAll}
            onCleanPage={pipelines.handleCleanPage}
            onRevertClean={pipelines.handleRevertClean}
            onToggleTypeset={actions.handleToggleTypeset}
            onToggleJapOverlay={actions.handleToggleJapOverlay}
          />

          <TextBlocksList
            currentPage={currentPage}
            textBlocks={blocks.textBlocks}
            selectedId={blocks.selectedId}
            defaultFontSize={settings.titleFontSize}
            autoOvalBubble={settings.globalSettings.auto_oval_bubble ?? true}
            onSelect={blocks.setSelectedId}
            onUpdate={blocks.updateBlock}
            onDelete={blocks.deleteBlock}
            onMoveUp={(id) => blocks.moveBlock(id, "up")}
            onMoveDown={(id) => blocks.moveBlock(id, "down")}
            onSpotClean={blocks.spotCleanBlock}
          />
        </section>
      </div>

      {showHotkeysModal && <HotkeysModal onClose={() => setShowHotkeysModal(false)} />}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onSettingsUpdated={(newSettings) => {
            settings.setGlobalSettings((prev) => ({ ...prev, ...newSettings }))
          }}
        />
      )}

      {showStatisticsModal && (
        <StatisticsModal
          currentChapterId={currentChapterId}
          onClose={() => setShowStatisticsModal(false)}
        />
      )}
    </div>
  )
}

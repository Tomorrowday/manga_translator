// manga_ui/components/manga-translator_impl.tsx
// Главный контейнер Manga Translator с поддержкой таймера текущей главы и модалки статистики

"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { PageItem, PageStatus, TitleSettings, TextBlock } from "@/lib/types"
import { ImageViewer } from "@/components/image-viewer"
import { Sidebar } from "@/components/sidebar"
import { BatchChapterActions } from "@/components/batch-chapter-actions"
import { TranslatorHeader } from "@/components/translator-header"
import { TranslationToolbar } from "@/components/translation-toolbar"
import { TextBlocksList } from "@/components/text-blocks-list"
import { HotkeysModal } from "@/components/hotkeys-modal"
import { SettingsModal } from "@/components/settings-modal"
import { StatisticsModal } from "@/components/statistics-modal"
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
  updateTitleSettings,
  resetChapterBubbleFonts,
  getGlobalSettings,
  exportChapterScriptToFolder,
  getChapterTimerStatus,
  startChapterTimer,
  stopChapterTimer,
} from "@/lib/api"
import type { MangaTranslatorProps } from "./manga-translator"

const RIGHT_PANEL_STORAGE_KEY = "manga_right_panel_width"
const DEFAULT_PANEL_WIDTH = 490

export function MangaTranslator(_props: MangaTranslatorProps) {
  const [currentPage, setCurrentPage] = useState<PageItem | null>(null)
  const [chapterPages, setChapterPages] = useState<PageItem[]>([])
  const [viewMode, setViewMode] = useState<"original" | "clean">("original")
  const [cleanCacheBuster, setCleanCacheBuster] = useState<number>(Date.now())
  const [showTypeset, setShowTypeset] = useState(false)
  const [brushSize, setBrushSize] = useState<number>(32)

  // Базовый размер шрифта для текущего тайтла
  const [currentTitleId, setCurrentTitleId] = useState<number | null>(null)
  const [titleFontSize, setTitleFontSize] = useState<number>(14)
  const [isApplyingChapterFont, setIsApplyingChapterFont] = useState(false)

  // Трекинг времени текущей главы
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)

  // Ширина правой панели (свободно изменяемая сплиттером)
  const [panelWidth, setPanelWidth] = useState<number>(DEFAULT_PANEL_WIDTH)
  const [isResizing, setIsResizing] = useState<boolean>(false)

  // Загружаем сохранённую пользователем ширину панели
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RIGHT_PANEL_STORAGE_KEY)
      if (saved) {
        const val = parseInt(saved, 10)
        if (!isNaN(val) && val >= 360 && val <= 1000) {
          setPanelWidth(val)
        }
      }
    } catch {}
  }, [])

  // Глобальные настройки приложения
  const [globalSettings, setGlobalSettings] = useState<TitleSettings>({
    auto_oval_bubble: true,
    default_padding: "safe",
    default_hyphenation: true,
    font_bubble: "v_CCFaceFront",
    font_thought: "v_CCFaceFront",
    font_sfx: "v_Mighty Zeo 2.0",
    show_sfx: false,
  })

  const [knownSpeakers, setKnownSpeakers] = useState<string[]>([])
  const [activePageUpdate, setActivePageUpdate] = useState<{ id: number; status: PageStatus; clean_path?: string } | null>(null)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)

  // Модальные окна
  const [showHotkeysModal, setShowHotkeysModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showStatisticsModal, setShowStatisticsModal] = useState(false)

  const chapterPagesRef = useRef<PageItem[]>([])
  chapterPagesRef.current = chapterPages
  const isSwitchingPageRef = useRef(false)

  // Получение актуального id текущей главы
  const currentChapterId = currentPage?.chapter_id || chapterPages[0]?.chapter_id || null

  // Загрузка состояния таймера при переключении главы
  useEffect(() => {
    if (!currentChapterId) {
      setIsTimerRunning(false)
      setTimerSeconds(0)
      return
    }

    let active = true
    getChapterTimerStatus(currentChapterId)
      .then((res) => {
        if (!active) return
        setIsTimerRunning(res.is_running)
        setTimerSeconds(res.total_seconds)
      })
      .catch((e) => console.warn("Не удалось получить статус таймера:", e))

    return () => {
      active = false
    }
  }, [currentChapterId])

  // Тикание таймера раз в секунду при активной сессии
  useEffect(() => {
    if (!isTimerRunning) return
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isTimerRunning])

  const handleStartTimer = useCallback(async () => {
    if (!currentChapterId) return
    try {
      const res = await startChapterTimer(currentChapterId)
      if (res.success) {
        setIsTimerRunning(true)
        setTimerSeconds(res.total_seconds)
      }
    } catch (e) {
      console.error("Ошибка старта таймера:", e)
    }
  }, [currentChapterId])

  const handleStopTimer = useCallback(async () => {
    if (!currentChapterId) return
    try {
      const res = await stopChapterTimer(currentChapterId)
      if (res.success) {
        setIsTimerRunning(false)
        setTimerSeconds(res.total_seconds)
      }
    } catch (e) {
      console.error("Ошибка остановки таймера:", e)
    }
  }, [currentChapterId])

  // Обработчик сплиттера
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      const minW = 360
      const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.55))
      const clamped = Math.min(Math.max(newWidth, minW), maxW)
      setPanelWidth(clamped)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setPanelWidth((latest) => {
        try {
          localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(latest))
        } catch {}
        return latest
      })
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])

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

  const handleTitleFontSizeChange = useCallback(async (newSize: number) => {
    setTitleFontSize(newSize)
    if (currentTitleId) {
      try {
        await updateTitleSettings(currentTitleId, { default_font_size: newSize } as any)
      } catch (err) {
        console.warn("Не удалось сохранить размер шрифта тайтла:", err)
      }
    }
  }, [currentTitleId])

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
  }, [currentPage?.chapter_id, chapterPages, titleFontSize])

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
  } = usePageBlocks(
    currentPage,
    { ...globalSettings, default_font_size: titleFontSize },
    handlePageStatusUpdate,
    refreshSpeakersList
  )

  const pipelines = usePagePipelines({
    currentPage,
    setCurrentPage,
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    globalSettings: { ...globalSettings, default_font_size: titleFontSize },
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

  const handleTitleSelected = useCallback((titleId: number, defaultFontSize?: number) => {
    setCurrentTitleId(titleId)
    if (defaultFontSize) {
      setTitleFontSize(defaultFontSize)
    }
  }, [])

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
        const loaded: TextBlock[] = []
        for (const b of dbBlocks) {
          const cropped = img.naturalWidth > 0 ? await cropRegion(img, { ...b, rotation: b.rotation || 0 }) : { dataUrl: "" }
          const mapped = mapDbBlockToTextBlock({ ...b, imageCrop: cropped.dataUrl, image_crop: cropped.dataUrl })
          mapped.imageCrop = cropped.dataUrl
          loaded.push(mapped)
        }
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
            const fresh: TextBlock[] = []
            for (const box of detectRes.boxes) {
              const cropped = await cropRegion(img, { ...box, rotation: 0 })

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
                fontSize: undefined,
                fontFamily: box.font_family || globalSettings.font_bubble || "v_CCFaceFront",
                textColor: "black",
                shape: "rect",
                paddingMode: (box.padding_mode as TextBlock["paddingMode"]) || globalSettings.default_padding || "safe",
                minHyphens: box.min_hyphens !== undefined ? box.min_hyphens : (globalSettings.default_hyphenation ?? true),
                status: (box.status as TextBlock["status"]) || (box.jap_text ? "ocr-done" : "new"),
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
    defaultFontSize: titleFontSize,
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

  const currentSpeakers = textBlocks.map((b) => b.speaker?.trim()).filter((s): s is string => !!s)
  const allSpeakerSuggestions = Array.from(new Set([...knownSpeakers, ...currentSpeakers])).sort()

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
        currentIndex={currentPageIdx}
        totalPages={chapterPages.length}
        currentChapterId={currentChapterId}
        titleFontSize={titleFontSize}
        onTitleFontSizeChange={handleTitleFontSizeChange}
        onApplyFontSizeToChapter={handleApplyFontSizeToChapter}
        isApplyingChapterFont={isApplyingChapterFont}
        isSaving={isSaving}
        isExporting={pipelines.isExporting}
        isExportSuccess={pipelines.isExportSuccess}
        isTimerRunning={isTimerRunning}
        timerSeconds={timerSeconds}
        onStartTimer={handleStartTimer}
        onStopTimer={handleStopTimer}
        onOpenFolder={() => currentPage && openTranslatedFolder(currentPage.id)}
        onExportPage={pipelines.handleExportPage}
        onSaveBlocks={() => saveBlocks(true)}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onOpenHotkeys={() => setShowHotkeysModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenStatistics={() => setShowStatisticsModal(true)}
      />

      <BatchChapterActions
        pages={chapterPages}
        currentPageId={currentPage?.id ?? null}
        titleDefaultFontSize={titleFontSize}
        onSaveCurrentPage={() => saveBlocks(true)}
        onPageStatusUpdate={handlePageStatusUpdate}
        onCompleteBatch={() => setSidebarRefreshTrigger((prev) => prev + 1)}
        onRefreshCurrent={() => {
          if (currentPage) handleSelectPage(currentPage, true)
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden relative">
        <Sidebar
          currentPageId={currentPage?.id || null}
          activePageUpdate={activePageUpdate}
          refreshTrigger={sidebarRefreshTrigger}
          onSelectPage={(page) => handleSelectPage(page, false)}
          onActiveChapterChange={setChapterPages}
          onChapterDeleted={handleChapterDeleted}
          onTitleSelected={handleTitleSelected}
        />

        <ImageViewer
          imageSrc={activeImageSrc}
          textBlocks={textBlocks}
          selectedId={selectedId}
          showTypeset={showTypeset}
          pageNumber={currentPage?.page_number}
          hasCleanScan={Boolean(currentPage?.clean_path)}
          viewMode={viewMode}
          defaultFontSize={titleFontSize}
          brushSize={brushSize}
          onBrushResize={handleBrushResize}
          onToggleViewMode={handleToggleViewMode}
          onSelect={setSelectedId}
          onDrawComplete={addOrUpdateDrawnBlock}
          onUpdateBlock={updateBlock}
          onBrushClean={handleBrushClean}
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
            defaultFontSize={titleFontSize}
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

      {showStatisticsModal && (
        <StatisticsModal
          currentChapterId={currentChapterId}
          onClose={() => setShowStatisticsModal(false)}
        />
      )}
    </div>
  )
}
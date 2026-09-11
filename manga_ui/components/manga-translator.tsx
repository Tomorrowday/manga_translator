"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { BookText, Layers } from "lucide-react"
import type { TextBlock, PageItem, PageStatus } from "@/lib/types"
import { ImageViewer } from "@/components/image-viewer"
import { TextBlockCard } from "@/components/text-block-card"
import { Sidebar } from "@/components/sidebar"
import { BatchChapterActions } from "@/components/batch-chapter-actions"
import { TranslatorHeader } from "@/components/translator-header"
import { TranslationToolbar } from "@/components/translation-toolbar"
import { cropRegion, bakePageBlob, loadImage, mapDbBlockToTextBlock } from "@/lib/typeset"
import { BUBBLE_HOTKEYS } from "@/lib/hotkeys"
import {
  getPageDetails,
  getPageSpeakers,
  runPageAutoDetect,
  getPageImageUrl,
  getPageCleanImageUrl,
  getPageBlocks,
  savePageBlocks,
  runBatchTranslate,
  runOcr,
  runCleanPage,
  revertCleanPage,
  runSpotClean,
  saveTranslatedPage,
  openTranslatedFolder,
} from "@/lib/api"

interface DrawRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

function getMangaScore(b: { x: number; y: number }): number {
  const rowIdx = Math.floor(b.y / 0.18)
  return rowIdx * 1000 + (1 - b.x) * 100
}

export function MangaTranslator() {
  const [currentPage, setCurrentPage] = useState<PageItem | null>(null)
  const [chapterPages, setChapterPages] = useState<PageItem[]>([])
  const [viewMode, setViewMode] = useState<"original" | "clean">("original")
  const [cleanCacheBuster, setCleanCacheBuster] = useState<number>(Date.now())
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [isDetecting, setIsDetecting] = useState(false)
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showTypeset, setShowTypeset] = useState(false)
  const [isBatchTranslating, setIsBatchTranslating] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [isRevertingClean, setIsRevertingClean] = useState(false)
  const [isFullAuto, setIsFullAuto] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportSuccess, setIsExportSuccess] = useState(false)

  const [knownSpeakers, setKnownSpeakers] = useState<string[]>([])

  const [activePageUpdate, setActivePageUpdate] = useState<{ id: number; status: PageStatus; clean_path?: string } | null>(null)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)

  const textBlocksRef = useRef<TextBlock[]>([])
  textBlocksRef.current = textBlocks
  const currentPageRef = useRef<PageItem | null>(null)
  currentPageRef.current = currentPage
  const chapterPagesRef = useRef<PageItem[]>([])
  chapterPagesRef.current = chapterPages

  const refreshSpeakersList = useCallback(async (pageId: number) => {
    try {
      const speakers = await getPageSpeakers(pageId)
      if (speakers && speakers.length > 0) {
        setKnownSpeakers(speakers)
      }
    } catch (e) {
      console.error("Ошибка загрузки подсказок спикеров:", e)
    }
  }, [])

  const handlePageStatusUpdate = useCallback((pageId: number, status: PageStatus, cleanPath?: string) => {
    setActivePageUpdate({ id: pageId, status, clean_path: cleanPath })

    if (currentPageRef.current && currentPageRef.current.id === pageId) {
      setCurrentPage((prev) => {
        if (!prev) return null
        return {
          ...prev,
          status,
          clean_path: cleanPath !== undefined ? cleanPath : prev.clean_path,
        }
      })
      if (cleanPath) {
        setCleanCacheBuster(Date.now())
        setViewMode("clean")
      }
    }
  }, [])

  const handleSaveBlocks = useCallback(
    async (refreshSpeakers = true) => {
      if (!currentPageRef.current) return
      setIsSaving(true)
      try {
        const payload = textBlocksRef.current.map((b) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          rotation: b.rotation || 0,
          jap_text: b.japText,
          rus_text: b.rusText,
          speaker: b.speaker || "",
          order_index: b.orderIndex || 0,
          font_size: b.fontSize,
          font_family: b.fontFamily,
          is_bold: b.isBold,
          is_italic: b.isItalic,
          is_uppercase: b.isUppercase,
          has_stroke: b.hasStroke,
          shape: b.shape || "rect",
          padding_mode: b.paddingMode || "safe",
          status: b.status,
        }))

        const res = await savePageBlocks(currentPageRef.current.id, payload)
        if (res.page_status) {
          handlePageStatusUpdate(currentPageRef.current.id, res.page_status)
        }

        if (refreshSpeakers && currentPageRef.current) {
          refreshSpeakersList(currentPageRef.current.id)
        }
      } catch (e) {
        console.error("Ошибка сохранения блоков:", e)
      } finally {
        setIsSaving(false)
      }
    },
    [handlePageStatusUpdate, refreshSpeakersList]
  )

  const updateBlock = useCallback((id: string, patch: Partial<TextBlock>) => {
    setTextBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }, [])

  const deleteBlock = useCallback((id: string) => {
    setTextBlocks((prev) => {
      const filtered = prev.filter((b) => b.id !== id)
      return filtered.map((b, idx) => ({ ...b, orderIndex: idx + 1 }))
    })
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  const moveBlock = useCallback((id: string, direction: "up" | "down") => {
    setTextBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      if (idx < 0) return prev
      const swapWith = direction === "up" ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
      return next.map((b, i) => ({ ...b, orderIndex: i + 1 }))
    })
  }, [])

  const handleSpotCleanBlock = useCallback(
    async (block: TextBlock, method: "auto" | "lama" | "white" = "auto", deleteAfter = false) => {
      if (!currentPageRef.current) return
      try {
        const res = await runSpotClean(
          currentPageRef.current.id,
          { x: block.x, y: block.y, width: block.width, height: block.height },
          method
        )
        if (res.success) {
          setCleanCacheBuster(Date.now())
          setViewMode("clean")
          handlePageStatusUpdate(currentPageRef.current.id, res.page_status || "cleaned", res.clean_path)

          if (deleteAfter) {
            deleteBlock(block.id)
          }
        } else {
          alert("Ошибка точечного клина: " + (res.error || "Неизвестная ошибка"))
        }
      } catch (e) {
        alert("Ошибка точечного клина: " + String(e))
      }
    },
    [handlePageStatusUpdate, deleteBlock]
  )

  const handleSelectPage = async (page: PageItem, skipSave = false) => {
    if (!skipSave && currentPageRef.current && textBlocksRef.current.length > 0) {
      await handleSaveBlocks(false)
    }

    const freshPage = (await getPageDetails(page.id)) || page
    setCurrentPage(freshPage)
    setSelectedId(null)
    setViewMode(freshPage.clean_path ? "clean" : "original")
    setCleanCacheBuster(Date.now())

    refreshSpeakersList(freshPage.id)

    const rawUrl = getPageImageUrl(page.id)

    try {
      const dbBlocks = await getPageBlocks(page.id)

      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = rawUrl

      await new Promise((resolve) => {
        if (img.complete && img.naturalWidth > 0) resolve(true)
        else {
          img.onload = () => resolve(true)
          img.onerror = () => resolve(false)
        }
      })

      const loadedBlocks: TextBlock[] = []
      for (const b of dbBlocks) {
        let cropDataUrl = ""
        if (img.naturalWidth > 0) {
          const cropped = await cropRegion(img, { ...b, rotation: b.rotation || 0 })
          cropDataUrl = cropped.dataUrl
        }
        loadedBlocks.push(mapDbBlockToTextBlock(b, cropDataUrl))
      }

      if (loadedBlocks.length > 0) {
        setTextBlocks(loadedBlocks)
        setSelectedId(loadedBlocks[0].id)
      } else {
        const detectRes = await runPageAutoDetect(page.id)
        if (detectRes && detectRes.boxes && detectRes.boxes.length > 0) {
          const freshBlocks: TextBlock[] = []
          for (const box of detectRes.boxes) {
            const cropped = await cropRegion(img, { ...box, rotation: 0 })
            freshBlocks.push({
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
              shape: "rect",
              paddingMode: "safe",
              status: (box.status as TextBlock["status"]) || (box.jap_text ? "ocr-done" : "new"),
            })
          }
          setTextBlocks(freshBlocks)
          if (freshBlocks.length > 0) setSelectedId(freshBlocks[0].id)
          handlePageStatusUpdate(page.id, "detected")
        } else {
          setTextBlocks([])
        }
      }
    } catch (e) {
      console.error("Не удалось загрузить блоки страницы:", e)
      setTextBlocks([])
    }
  }

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return
      }

      const code = e.code
      const key = e.key

      if (code === "PageUp" || (e.altKey && code === "ArrowLeft")) {
        e.preventDefault()
        handlePrevPage()
        return
      }
      if (code === "PageDown" || (e.altKey && code === "ArrowRight")) {
        e.preventDefault()
        handleNextPage()
        return
      }

      if ((e.ctrlKey || e.metaKey) && (code === "KeyS" || key.toLowerCase() === "s" || key.toLowerCase() === "ы")) {
        e.preventDefault()
        handleSaveBlocks(true)
        return
      }

      if (!selectedId) return
      const activeBlock = textBlocksRef.current.find((b) => b.id === selectedId)
      if (!activeBlock) return

      if (code === "Delete" || code === "Backspace" || key === "Delete" || key === "Backspace") {
        e.preventDefault()
        deleteBlock(selectedId)
        return
      }

      if (code === BUBBLE_HOTKEYS.moveOrderUp.code || (e.altKey && code === "ArrowUp")) {
        e.preventDefault()
        moveBlock(selectedId, "up")
        return
      }
      if (code === BUBBLE_HOTKEYS.moveOrderDown.code || (e.altKey && code === "ArrowDown")) {
        e.preventDefault()
        moveBlock(selectedId, "down")
        return
      }

      if (key === "-" || key === "_" || code === "NumpadSubtract") {
        e.preventDefault()
        const curFont = activeBlock.fontSize || Math.max(11, Math.min(16, Math.round(11 + (activeBlock.height || 0.1) * 22)))
        updateBlock(selectedId, { fontSize: Math.max(8, curFont - 1) })
        return
      }
      if (key === "+" || key === "=" || code === "NumpadAdd") {
        e.preventDefault()
        const curFont = activeBlock.fontSize || Math.max(11, Math.min(16, Math.round(11 + (activeBlock.height || 0.1) * 22)))
        updateBlock(selectedId, { fontSize: Math.min(36, curFont + 1) })
        return
      }

      if (code === BUBBLE_HOTKEYS.toggleShape.code) {
        e.preventDefault()
        updateBlock(selectedId, { shape: activeBlock.shape === "ellipse" ? "rect" : "ellipse" })
        return
      }

      if (code === BUBBLE_HOTKEYS.toggleStroke.code && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        updateBlock(selectedId, { hasStroke: !activeBlock.hasStroke })
        return
      }

      if (code === BUBBLE_HOTKEYS.togglePadding.code) {
        e.preventDefault()
        updateBlock(selectedId, { paddingMode: activeBlock.paddingMode === "fit" ? "safe" : "fit" })
        return
      }

      if (code === BUBBLE_HOTKEYS.toggleBold.code && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        updateBlock(selectedId, { isBold: !activeBlock.isBold })
        return
      }

      if (code === BUBBLE_HOTKEYS.toggleItalic.code && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        updateBlock(selectedId, { isItalic: !activeBlock.isItalic })
        return
      }

      if (code === BUBBLE_HOTKEYS.toggleUppercase.code) {
        e.preventDefault()
        updateBlock(selectedId, { isUppercase: !activeBlock.isUppercase })
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedId, deleteBlock, updateBlock, moveBlock, handleSaveBlocks, handlePrevPage, handleNextPage])

  const handleDrawComplete = useCallback(
    async (rect: DrawRect, img: HTMLImageElement, existingId?: string, rotation?: number) => {
      const rot = rotation !== undefined ? rotation : rect.rotation || 0
      const { dataUrl } = await cropRegion(img, { ...rect, rotation: rot })

      // При ресайзе/вращении существующего бабла сохраняем статус перевода и текст
      if (existingId) {
        setTextBlocks((prev) =>
          prev.map((b) =>
            b.id === existingId
              ? {
                  ...b,
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  rotation: rot,
                  imageCrop: dataUrl,
                }
              : b
          )
        )
        return
      }

      const id = crypto.randomUUID()
      const newBlock: TextBlock = {
        id,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotation: rot,
        imageCrop: dataUrl,
        japText: "",
        rusText: "",
        shape: "rect",
        paddingMode: "safe",
        status: "new",
      }

      setTextBlocks((prev) => {
        if (prev.length === 0) {
          return [{ ...newBlock, orderIndex: 1 }]
        }

        const newScore = getMangaScore(newBlock)
        let insertIdx = prev.length

        for (let i = 0; i < prev.length; i++) {
          if (getMangaScore(prev[i]) > newScore) {
            insertIdx = i
            break
          }
        }

        const next = [...prev]
        next.splice(insertIdx, 0, newBlock)
        return next.map((b, idx) => ({ ...b, orderIndex: idx + 1 }))
      })

      setSelectedId(id)
    },
    []
  )

  const handleOcrAllBlocks = async () => {
    if (!currentPage || textBlocks.length === 0) return
    setIsOcrRunning(true)

    try {
      const updated = [...textBlocks]
      for (let i = 0; i < updated.length; i++) {
        const b = updated[i]
        const text = await runOcr(currentPage.id, b.x, b.y, b.width, b.height, b.rotation || 0)
        updated[i] = {
          ...b,
          japText: text,
          status: b.status === "translated" ? "translated" : "ocr-done",
        }
      }
      setTextBlocks(updated)
      textBlocksRef.current = updated
      await handleSaveBlocks(true)
    } catch (e) {
      console.error("Ошибка распознавания всех рамок:", e)
      alert("Ошибка OCR")
    } finally {
      setIsOcrRunning(false)
    }
  }

  const handleTranslateAll = async () => {
    if (!currentPage || textBlocks.length === 0) return
    setIsBatchTranslating(true)

    try {
      const currentBlocks = [...textBlocks]
      for (let i = 0; i < currentBlocks.length; i++) {
        const b = currentBlocks[i]
        if (!b.japText) {
          const ocrText = await runOcr(currentPage.id, b.x, b.y, b.width, b.height, b.rotation || 0)
          currentBlocks[i] = { ...b, japText: ocrText, status: "ocr-done" }
        }
      }
      setTextBlocks([...currentBlocks])

      const toTranslate = currentBlocks
        .filter((b) => b.japText.trim().length > 0)
        .map((b) => ({ id: b.id, text: b.japText, speaker: b.speaker, order_index: b.orderIndex }))

      if (toTranslate.length === 0) {
        setIsBatchTranslating(false)
        return
      }

      const translations = await runBatchTranslate(toTranslate, currentPage.id)

      const updated = currentBlocks.map((b) => {
        if (translations[b.id]) {
          return { ...b, rusText: translations[b.id], status: "translated" as const }
        }
        return b
      })

      setTextBlocks(updated)
      textBlocksRef.current = updated
      await handleSaveBlocks(true)

      setShowTypeset(true)
      handlePageStatusUpdate(currentPage.id, "translated")
    } catch (e) {
      console.error(e)
      alert("Ошибка при массовом переводе")
    } finally {
      setIsBatchTranslating(false)
    }
  }

  const handleExportPage = async () => {
    if (!currentPage) return
    setIsExporting(true)

    try {
      await handleSaveBlocks(true)

      let cleanPath = currentPage.clean_path
      if (!cleanPath) {
        const cleanRes = await runCleanPage(currentPage.id)
        if (cleanRes.success && cleanRes.clean_path) {
          cleanPath = cleanRes.clean_path
          handlePageStatusUpdate(currentPage.id, "cleaned", cleanPath)
        }
      }

      const baseImgUrl = cleanPath
        ? `${getPageCleanImageUrl(currentPage.id)}?t=${cleanCacheBuster}`
        : getPageImageUrl(currentPage.id)

      const baseImg = await loadImage(baseImgUrl)
      const blob = await bakePageBlob(baseImg, textBlocksRef.current)

      if (!blob) {
        throw new Error("Не удалось создать Blob изображения в Canvas")
      }

      const res = await saveTranslatedPage(currentPage.id, blob)
      if (res.success) {
        setIsExportSuccess(true)
        handlePageStatusUpdate(currentPage.id, "done")
        setTimeout(() => setIsExportSuccess(false), 2500)
      } else {
        alert("Ошибка запекания: " + (res.error || "Неизвестная ошибка"))
      }
    } catch (e) {
      console.error("Ошибка экспорта:", e)
      alert("Ошибка экспорта: " + String(e))
    } finally {
      setIsExporting(false)
    }
  }

  const handleCleanPage = async () => {
    if (!currentPage) return
    if (textBlocks.length === 0) {
      alert("Сначала запустите Auto-Detect, чтобы найти баблы.")
      return
    }

    setIsCleaning(true)
    try {
      await handleSaveBlocks(true)
      const res = await runCleanPage(currentPage.id)
      if (res.success) {
        setCleanCacheBuster(Date.now())
        setViewMode("clean")
        setShowTypeset(true)
        handlePageStatusUpdate(currentPage.id, "cleaned", res.clean_path)
      } else {
        alert("Ошибка клина: " + res.error)
      }
    } catch (e) {
      console.error(e)
      alert("Не удалось очистить страницу")
    } finally {
      setIsCleaning(false)
    }
  }

  const handleRevertClean = async () => {
    if (!currentPage || !currentPage.clean_path) return
    if (!confirm("Откатить клин этой страницы и вернуться к исходному скану? Все баблы и переводы сохранятся.")) return

    setIsRevertingClean(true)
    try {
      const res = await revertCleanPage(currentPage.id)
      if (res.success) {
        setCurrentPage((prev) => (prev ? { ...prev, clean_path: undefined, status: res.page_status } : null))
        setViewMode("original")
        setCleanCacheBuster(Date.now())
        handlePageStatusUpdate(currentPage.id, res.page_status, "")
      } else {
        alert("Ошибка отката клина: " + (res.error || res.detail))
      }
    } catch (e) {
      alert("Ошибка при откате клина: " + String(e))
    } finally {
      setIsRevertingClean(false)
    }
  }

  const handleAutoDetect = async () => {
    if (!currentPage) return
    setIsDetecting(true)

    try {
      const detectRes = await runPageAutoDetect(currentPage.id)
      const boxes = detectRes.boxes || []
      if (!boxes || boxes.length === 0) {
        alert("Баблы не найдены!")
        setIsDetecting(false)
        return
      }

      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = getPageImageUrl(currentPage.id)
      await new Promise((resolve) => {
        img.onload = resolve
        img.onerror = resolve
      })

      const newBlocks: TextBlock[] = []
      for (const box of boxes) {
        const { dataUrl } = await cropRegion(img, { ...box, rotation: 0 })
        newBlocks.push({
          id: box.id || crypto.randomUUID(),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rotation: 0,
          imageCrop: dataUrl,
          japText: box.jap_text || "",
          rusText: "",
          orderIndex: box.order_index,
          shape: "rect",
          paddingMode: "safe",
          status: (box.status as TextBlock["status"]) || (box.jap_text ? "ocr-done" : "new"),
        })
      }

      setTextBlocks(newBlocks)
      if (newBlocks.length > 0) setSelectedId(newBlocks[0].id)
      handlePageStatusUpdate(currentPage.id, "detected")
    } catch (e) {
      console.error(e)
      alert("Ошибка при авто-детекции")
    } finally {
      setIsDetecting(false)
    }
  }

  const handleFullAuto = async () => {
    if (!currentPage) return
    setIsFullAuto(true)

    try {
      let currentBlocks = [...textBlocks]
      if (currentBlocks.length === 0) {
        await handleAutoDetect()
        currentBlocks = textBlocksRef.current
      }

      if (currentBlocks.length === 0) {
        alert("Баблы не обнаружены.")
        setIsFullAuto(false)
        return
      }

      for (let i = 0; i < currentBlocks.length; i++) {
        const b = currentBlocks[i]
        if (!b.japText) {
          const ocrText = await runOcr(currentPage.id, b.x, b.y, b.width, b.height, b.rotation || 0)
          currentBlocks[i] = { ...b, japText: ocrText, status: "ocr-done" }
        }
      }

      const toTranslate = currentBlocks
        .filter((b) => b.japText.trim().length > 0)
        .map((b) => ({ id: b.id, text: b.japText, speaker: b.speaker, order_index: b.orderIndex }))

      if (toTranslate.length > 0) {
        const translations = await runBatchTranslate(toTranslate, currentPage.id)
        currentBlocks = currentBlocks.map((b) => {
          if (translations[b.id]) {
            return { ...b, rusText: translations[b.id], status: "translated" as const }
          }
          return b
        })
      }
      setTextBlocks([...currentBlocks])
      textBlocksRef.current = currentBlocks

      await handleSaveBlocks(true)

      const cleanRes = await runCleanPage(currentPage.id)
      if (cleanRes.success) {
        setCleanCacheBuster(Date.now())
        setViewMode("clean")
        setShowTypeset(true)

        const cleanImgUrl = `${getPageCleanImageUrl(currentPage.id)}?t=${Date.now()}`
        const cleanImg = await loadImage(cleanImgUrl)
        const blob = await bakePageBlob(cleanImg, textBlocksRef.current)

        if (blob) {
          await saveTranslatedPage(currentPage.id, blob)
          setIsExportSuccess(true)
          handlePageStatusUpdate(currentPage.id, "done", cleanRes.clean_path)
          setTimeout(() => setIsExportSuccess(false), 2500)
        }
      }
    } catch (e) {
      console.error(e)
      alert("Ошибка при автоматической обработке: " + String(e))
    } finally {
      setIsFullAuto(false)
    }
  }

  const translatedCount = textBlocks.filter((b) => b.status === "translated").length

  const currentBlocksSpeakers = textBlocks
    .map((b) => b.speaker?.trim())
    .filter((s): s is string => !!s)

  const allSpeakerSuggestions = Array.from(new Set([...knownSpeakers, ...currentBlocksSpeakers])).sort()

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
        isExporting={isExporting}
        isExportSuccess={isExportSuccess}
        onOpenFolder={() => currentPage && openTranslatedFolder(currentPage.id)}
        onExportPage={handleExportPage}
        onSaveBlocks={() => handleSaveBlocks(true)}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
      />

      <BatchChapterActions
        pages={chapterPages}
        currentPageId={currentPage?.id ?? null}
        onPageStatusUpdate={handlePageStatusUpdate}
        onCompleteBatch={() => setSidebarRefreshTrigger((prev) => prev + 1)}
        onRefreshCurrent={() => {
          if (currentPageRef.current) handleSelectPage(currentPageRef.current, true)
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          currentPageId={currentPage?.id || null}
          activePageUpdate={activePageUpdate}
          refreshTrigger={sidebarRefreshTrigger}
          onSelectPage={(page) => handleSelectPage(page, false)}
          onActiveChapterChange={setChapterPages}
        />

        <ImageViewer
          imageSrc={activeImageSrc}
          textBlocks={textBlocks}
          selectedId={selectedId}
          showTypeset={showTypeset}
          pageNumber={currentPage?.page_number}
          hasCleanScan={Boolean(currentPage?.clean_path)}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((prev) => (prev === "original" ? "clean" : "original"))}
          onSelect={setSelectedId}
          onDrawComplete={handleDrawComplete}
        />

        <section className="flex min-h-0 w-full flex-col border-t border-slate-800 lg:w-2/5 lg:border-l lg:border-t-0">
          <TranslationToolbar
            hasCurrentPage={Boolean(currentPage)}
            hasBlocks={textBlocks.length > 0}
            hasCleanScan={Boolean(currentPage?.clean_path)}
            isFullAuto={isFullAuto}
            isDetecting={isDetecting}
            isOcrRunning={isOcrRunning}
            isBatchTranslating={isBatchTranslating}
            isCleaning={isCleaning}
            isRevertingClean={isRevertingClean}
            showTypeset={showTypeset}
            onFullAuto={handleFullAuto}
            onAutoDetect={handleAutoDetect}
            onOcrAllBlocks={handleOcrAllBlocks}
            onTranslateAll={handleTranslateAll}
            onCleanPage={handleCleanPage}
            onRevertClean={handleRevertClean}
            onToggleTypeset={() => setShowTypeset((prev) => !prev)}
          />

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {!currentPage ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center text-slate-600">
                <BookText className="h-8 w-8" />
                <p className="text-sm font-medium text-slate-500">No page selected</p>
                <p className="max-w-[220px] text-xs">
                  Choose a chapter page from the explorer to see text blocks.
                </p>
              </div>
            ) : textBlocks.length === 0 ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center text-slate-600">
                <Layers className="h-8 w-8" />
                <p className="text-sm font-medium text-slate-500">No text blocks yet</p>
                <p className="max-w-[220px] text-xs">
                  Click &ldquo;1. Detect & OCR&rdquo; or drag a rectangle over a speech bubble.
                </p>
              </div>
            ) : (
              textBlocks.map((block, index) => (
                <TextBlockCard
                  key={block.id}
                  block={block}
                  index={index}
                  pageId={currentPage.id}
                  isSelected={block.id === selectedId}
                  onSelect={() => setSelectedId(block.id)}
                  onChange={(patch) => updateBlock(block.id, patch)}
                  onDelete={() => deleteBlock(block.id)}
                  onMoveUp={() => moveBlock(block.id, "up")}
                  onMoveDown={() => moveBlock(block.id, "down")}
                  canMoveUp={index > 0}
                  canMoveDown={index < textBlocks.length - 1}
                  onSpotClean={(method, deleteAfter) => handleSpotCleanBlock(block, method, deleteAfter)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
// manga_ui/hooks/use-page-pipelines.ts
// Тяжелые конвейеры обработки страницы: автодетект, OCR, Clean, Gemini, Export, Full-Auto

import { useState } from "react"
import type { PageItem, PageStatus, TextBlock } from "@/lib/types"
import { cropRegion, bakePageBlob, loadImage } from "@/lib/typeset"
import {
  runOcr,
  runBatchTranslate,
  runCleanPage,
  revertCleanPage,
  runPageAutoDetect,
  saveTranslatedPage,
  getPageImageUrl,
  getPageCleanImageUrl,
} from "@/lib/api"

interface UsePagePipelinesProps {
  currentPage: PageItem | null
  setCurrentPage: React.Dispatch<React.SetStateAction<PageItem | null>>
  textBlocks: TextBlock[]
  setTextBlocks: React.Dispatch<React.SetStateAction<TextBlock[]>>
  textBlocksRef: React.MutableRefObject<TextBlock[]>
  setSelectedId: (id: string | null) => void
  saveBlocks: (refreshSpeakers?: boolean) => Promise<void>
  onPageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void
  setShowTypeset: (show: boolean) => void
  setViewMode: (mode: "original" | "clean") => void
  cleanCacheBuster: number
}

export function usePagePipelines({
  currentPage,
  setCurrentPage,
  textBlocks,
  setTextBlocks,
  textBlocksRef,
  setSelectedId,
  saveBlocks,
  onPageStatusUpdate,
  setShowTypeset,
  setViewMode,
  cleanCacheBuster,
}: UsePagePipelinesProps) {
  const [isDetecting, setIsDetecting] = useState(false)
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [isBatchTranslating, setIsBatchTranslating] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [isRevertingClean, setIsRevertingClean] = useState(false)
  const [isFullAuto, setIsFullAuto] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportSuccess, setIsExportSuccess] = useState(false)

  const handleAutoDetect = async () => {
    if (!currentPage) return
    setIsDetecting(true)
    try {
      const detectRes = await runPageAutoDetect(currentPage.id)
      const boxes = detectRes.boxes || []

      if (!boxes || boxes.length === 0) {
        alert("Баблы не найдены!")
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
      textBlocksRef.current = newBlocks
      if (newBlocks.length > 0) setSelectedId(newBlocks[0].id)
      onPageStatusUpdate(currentPage.id, "detected")
    } catch (e) {
      console.error(e)
      alert("Ошибка при авто-детекции")
    } finally {
      setIsDetecting(false)
    }
  }

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
      await saveBlocks(true)
    } catch (e) {
      console.error("Ошибка OCR всех рамок:", e)
      alert("Ошибка OCR")
    } finally {
      setIsOcrRunning(false)
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
      await saveBlocks(true)
      const res = await runCleanPage(currentPage.id)
      if (res.success) {
        setViewMode("clean")
        onPageStatusUpdate(currentPage.id, (res.page_status as PageStatus) || "cleaned", res.clean_path)
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

      if (toTranslate.length === 0) return

      const translations = await runBatchTranslate(toTranslate, currentPage.id)
      const updated = currentBlocks.map((b) => {
        if (translations[b.id]) {
          return { ...b, rusText: translations[b.id], status: "translated" as const }
        }
        return b
      })

      setTextBlocks(updated)
      textBlocksRef.current = updated
      await saveBlocks(true)

      setShowTypeset(true)
      onPageStatusUpdate(currentPage.id, "translated")
    } catch (e) {
      console.error(e)
      alert("Ошибка при переводе")
    } finally {
      setIsBatchTranslating(false)
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
        onPageStatusUpdate(currentPage.id, res.page_status, "")
      } else {
        alert("Ошибка отката клина: " + (res.error || res.detail))
      }
    } catch (e) {
      alert("Ошибка при откате клина: " + String(e))
    } finally {
      setIsRevertingClean(false)
    }
  }

  const handleExportPage = async () => {
    if (!currentPage) return
    setIsExporting(true)
    try {
      await saveBlocks(true)

      let cleanPath = currentPage.clean_path
      if (!cleanPath) {
        const cleanRes = await runCleanPage(currentPage.id)
        if (cleanRes.success && cleanRes.clean_path) {
          cleanPath = cleanRes.clean_path
          onPageStatusUpdate(currentPage.id, "cleaned", cleanPath)
        }
      }

      const baseImgUrl = cleanPath
        ? `${getPageCleanImageUrl(currentPage.id)}?t=${cleanCacheBuster}`
        : getPageImageUrl(currentPage.id)

      const baseImg = await loadImage(baseImgUrl)
      const blob = await bakePageBlob(baseImg, textBlocksRef.current)

      if (!blob) throw new Error("Не удалось создать Blob изображения в Canvas")

      const res = await saveTranslatedPage(currentPage.id, blob)
      if (res.success) {
        setIsExportSuccess(true)
        onPageStatusUpdate(currentPage.id, "done")
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
        return
      }

      for (let i = 0; i < currentBlocks.length; i++) {
        const b = currentBlocks[i]
        if (!b.japText) {
          const ocrText = await runOcr(currentPage.id, b.x, b.y, b.width, b.height, b.rotation || 0)
          currentBlocks[i] = { ...b, japText: ocrText, status: "ocr-done" }
        }
      }
      setTextBlocks([...currentBlocks])
      textBlocksRef.current = currentBlocks
      await saveBlocks(true)

      const cleanRes = await runCleanPage(currentPage.id)
      if (!cleanRes.success) {
        throw new Error("Ошибка при очистке страницы: " + cleanRes.error)
      }
      setViewMode("clean")

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
      await saveBlocks(true)

      setShowTypeset(true)

      const cleanImgUrl = `${getPageCleanImageUrl(currentPage.id)}?t=${Date.now()}`
      const cleanImg = await loadImage(cleanImgUrl)
      const blob = await bakePageBlob(cleanImg, textBlocksRef.current)

      if (blob) {
        await saveTranslatedPage(currentPage.id, blob)
        setIsExportSuccess(true)
        onPageStatusUpdate(currentPage.id, "done", cleanRes.clean_path)
        setTimeout(() => setIsExportSuccess(false), 2500)
      }
    } catch (e) {
      console.error(e)
      alert("Ошибка при автоматической обработке: " + String(e))
    } finally {
      setIsFullAuto(false)
    }
  }

  return {
    isDetecting,
    isOcrRunning,
    isBatchTranslating,
    isCleaning,
    isRevertingClean,
    isFullAuto,
    isExporting,
    isExportSuccess,
    handleAutoDetect,
    handleOcrAllBlocks,
    handleTranslateAll,
    handleCleanPage,
    handleRevertClean,
    handleExportPage,
    handleFullAuto,
  }
}
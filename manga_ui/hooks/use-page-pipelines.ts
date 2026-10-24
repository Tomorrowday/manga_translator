// manga_ui/hooks/use-page-pipelines.ts
// Пайплайны обработки страниц: детект строго учитывает тоггл auto_oval_bubble из настроек

import { useState } from "react"
import type { PageItem, PageStatus, TextBlock, TitleSettings } from "@/lib/types"
import { cropRegion, bakePageBlob, loadImage } from "@/lib/typeset"
import {
  runOcr,
  runCleanPage,
  revertCleanPage,
  runPageAutoDetect,
  saveTranslatedPage,
  getPageImageUrl,
  getPageCleanImageUrl,
} from "@/lib/api"
import { runOllamaBatchTranslate, checkOllamaConnection } from "@/lib/api/ollama"

interface UsePagePipelinesProps {
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

async function runConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let currentIndex = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++
      results[idx] = await fn(items[idx], idx)
    }
  })

  await Promise.all(workers)
  return results
}

export function usePagePipelines({
  currentPage,
  setCurrentPage,
  textBlocks,
  setTextBlocks,
  textBlocksRef,
  globalSettings,
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

    if (textBlocks.length > 0 || (currentPage.status !== "raw" && currentPage.status !== "new")) {
      const ok = confirm("Пересканировать страницу с нуля? Текущие баблы будут заменены.")
      if (!ok) return
    }

    setIsDetecting(true)
    try {
      const isAutoOvalEnabled = globalSettings.auto_oval_bubble ?? true
      const detectRes = await runPageAutoDetect(
        currentPage.id,
        globalSettings.detect_conf,
        isAutoOvalEnabled
      )
      const boxes = detectRes.boxes || []

      if (!boxes || boxes.length === 0) {
        setTextBlocks([])
        textBlocksRef.current = []
        setSelectedId(null)
        onPageStatusUpdate(currentPage.id, "detected")
        alert("Баблы с текстом не найдены.")
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
        const isBubble = (box.class_id ?? 0) === 0
        // Форма строго зависит от тоггла: если включен - овал, если выключен - rect
        const resolvedShape = (isBubble && isAutoOvalEnabled) ? "ellipse" : (box.shape || "rect")

        newBlocks.push({
          id: box.id || crypto.randomUUID(),
          class_id: box.class_id ?? 0,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rotation: 0,
          imageCrop: dataUrl,
          japText: box.jap_text || "",
          rusText: "",
          orderIndex: box.order_index,
          fontSize: box.font_size || globalSettings.default_font_size || 14,
          fontFamily: box.font_family || globalSettings.font_bubble || "v_CCFaceFront",
          shape: resolvedShape,
          paddingMode: box.padding_mode || globalSettings.default_padding || "safe",
          minHyphens: box.min_hyphens !== undefined ? box.min_hyphens : (globalSettings.default_hyphenation ?? true),
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
      const currentBlocks = [...textBlocks]

      const ocrResults = await runConcurrent(currentBlocks, 3, async (b) => {
        const text = await runOcr(currentPage.id, b.x, b.y, b.width, b.height, b.rotation || 0)
        return {
          ...b,
          japText: text,
          status: b.status === "translated" ? ("translated" as const) : ("ocr-done" as const),
        }
      })

      setTextBlocks(ocrResults)
      textBlocksRef.current = ocrResults
      await saveBlocks(true)
    } catch (e) {
      console.error("Ошибка OCR всех рамок:", e)
      alert("Ошибка OCR")
    } finally {
      setIsOcrRunning(false)
    }
  }

  const handleCleanPage = async (mode: "auto" | "lama" | "white" = "auto") => {
    if (!currentPage) return
    if (textBlocks.length === 0) {
      alert("Сначала добавьте или найдите баблы для очистки.")
      return
    }

    setIsCleaning(true)
    try {
      await saveBlocks(true)
      const res = await runCleanPage(currentPage.id, mode)
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
      await saveBlocks(true)

      const blocksToOcr = textBlocks.map((b) => ({ ...b }))
      const neededOcrIndices = blocksToOcr
        .map((b, idx) => (!b.japText ? idx : null))
        .filter((idx): idx is number => idx !== null)

      if (neededOcrIndices.length > 0) {
        await runConcurrent(neededOcrIndices, 3, async (idx) => {
          const b = blocksToOcr[idx]
          const ocrText = await runOcr(currentPage.id, b.x, b.y, b.width, b.height, b.rotation || 0)
          blocksToOcr[idx] = { ...b, japText: ocrText, status: "ocr-done" }
        })
        setTextBlocks([...blocksToOcr])
        textBlocksRef.current = blocksToOcr
      }

      const toTranslate = blocksToOcr
        .filter((b) => b.japText.trim().length > 0)
        .map((b) => ({ id: b.id, text: b.japText, speaker: b.speaker }))

      if (toTranslate.length === 0) return

      const check = await checkOllamaConnection("http://localhost:11434")
      if (!check.ok) {
        alert(
          "Локальная нейросеть Ollama не запущена на http://localhost:11434.\n\n" +
          "Для перевода:\n" +
          "1. Запустите Ollama в командной строке: ollama run qwen2.5\n" +
          "2. Либо используйте кнопку «Export JSON» для перевода через Claude / ChatGPT."
        )
        return
      }

      const translations = await runOllamaBatchTranslate(toTranslate, {
        baseUrl: "http://localhost:11434",
        model: check.models.find((m) => m.includes("qwen") || m.includes("llama")) || check.models[0] || "qwen2.5:7b",
      })

      const updated = blocksToOcr.map((b) => {
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
      alert("Ошибка при локальном переводе: " + String(e))
    } finally {
      setIsBatchTranslating(false)
    }
  }

  const handleRevertClean = async () => {
    if (!currentPage || !currentPage.clean_path) return
    if (!confirm("Откатить клин этой страницы и вернуться к исходному скану?")) return

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
        const cleanRes = await runCleanPage(currentPage.id, "auto")
        if (cleanRes.success && cleanRes.clean_path) {
          cleanPath = cleanRes.clean_path
          onPageStatusUpdate(currentPage.id, "cleaned", cleanPath)
        }
      }

      const baseImgUrl = cleanPath
        ? `${getPageCleanImageUrl(currentPage.id)}?t=${cleanCacheBuster}`
        : getPageImageUrl(currentPage.id)

      const baseImg = await loadImage(baseImgUrl)
      const blob = await bakePageBlob(baseImg, textBlocksRef.current, globalSettings.default_font_size || 14)

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
      await saveBlocks(true)

      let currentBlocks = [...textBlocks]
      if (currentBlocks.length === 0 && (currentPage.status === "raw" || currentPage.status === "new")) {
        await handleAutoDetect()
        currentBlocks = textBlocksRef.current
      }

      if (currentBlocks.length === 0) {
        alert("Баблы на странице отсутствуют.")
        return
      }

      const neededOcrIndices = currentBlocks
        .map((b, idx) => (!b.japText ? idx : null))
        .filter((idx): idx is number => idx !== null)

      if (neededOcrIndices.length > 0) {
        await runConcurrent(neededOcrIndices, 3, async (idx) => {
          const b = currentBlocks[idx]
          const ocrText = await runOcr(currentPage.id, b.x, b.y, b.width, b.height, b.rotation || 0)
          currentBlocks[idx] = { ...b, japText: ocrText, status: "ocr-done" }
        })
        setTextBlocks([...currentBlocks])
        textBlocksRef.current = currentBlocks
        await saveBlocks(true)
      }

      const cleanRes = await runCleanPage(currentPage.id, "auto")
      if (!cleanRes.success) {
        throw new Error("Ошибка при очистке страницы: " + cleanRes.error)
      }
      setViewMode("clean")

      const check = await checkOllamaConnection("http://localhost:11434")
      if (check.ok) {
        const toTranslate = currentBlocks
          .filter((b) => b.japText.trim().length > 0)
          .map((b) => ({ id: b.id, text: b.japText, speaker: b.speaker }))

        if (toTranslate.length > 0) {
          const translations = await runOllamaBatchTranslate(toTranslate, {
            baseUrl: "http://localhost:11434",
            model: check.models[0] || "qwen2.5:7b",
          })
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
      }

      setShowTypeset(true)

      const cleanImgUrl = `${getPageCleanImageUrl(currentPage.id)}?t=${Date.now()}`
      const cleanImg = await loadImage(cleanImgUrl)
      const blob = await bakePageBlob(cleanImg, textBlocksRef.current, globalSettings.default_font_size || 14)

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
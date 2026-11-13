// manga_ui/hooks/pipelines/export-fullauto-pipeline.ts
// Экспорт запечённой страницы и полный авто-проход (детекция -> OCR -> клин -> перевод -> экспорт)

import { bakePageBlob, loadImage } from "@/lib/typeset"
import {
  getPageCleanImageUrl,
  getPageImageUrl,
  releaseVram,
  runCleanPage,
  runOcr,
  saveTranslatedPage,
} from "@/lib/api"
import { runOllamaBatchTranslate, checkOllamaConnection } from "@/lib/api/ollama"
import { runConcurrent } from "./concurrent-pool"
import type { PagePipelineContext } from "./types"

export async function executeExportPage(ctx: PagePipelineContext): Promise<void> {
  const {
    textBlocksRef,
    globalSettings,
    saveBlocks,
    onPageStatusUpdate,
    cleanCacheBuster,
    setIsExporting,
    setIsExportSuccess,
  } = ctx
  const currentPage = ctx.currentPage
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

export async function executeFullAuto(
  ctx: PagePipelineContext,
  runAutoDetect: () => Promise<void>
): Promise<void> {
  const {
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    globalSettings,
    saveBlocks,
    onPageStatusUpdate,
    setShowTypeset,
    setViewMode,
    setIsFullAuto,
    setIsExportSuccess,
  } = ctx
  const currentPage = ctx.currentPage
  if (!currentPage) return
  setIsFullAuto(true)
  try {
    await saveBlocks(true)

    let currentBlocks = [...textBlocks]
    if (currentBlocks.length === 0 && (currentPage.status === "raw" || currentPage.status === "new")) {
      await runAutoDetect()
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
        .map((b) => ({
          id: b.id,
          text: b.japText,
          speaker: b.speaker,
          class_id: b.class_id ?? 0,
        }))

      if (toTranslate.length > 0) {
        const translations = await runOllamaBatchTranslate(toTranslate, {
          baseUrl: "http://localhost:11434",
          model: check.models[0] || "qwen2.5:7b",
        })
        const autoOval = globalSettings.auto_oval_bubble ?? true
        currentBlocks = currentBlocks.map((b) => {
          if (translations[b.id]) {
            const isBubble = (b.class_id ?? 0) === 0
            return {
              ...b,
              rusText: translations[b.id],
              shape: isBubble && autoOval ? "ellipse" : b.shape,
              status: "translated" as const,
            }
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
    releaseVram()
    setIsFullAuto(false)
  }
}

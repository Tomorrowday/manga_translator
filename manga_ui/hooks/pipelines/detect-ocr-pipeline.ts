// manga_ui/hooks/pipelines/detect-ocr-pipeline.ts
// Авто-детекция баблов и массовое OCR всех рамок страницы

import type { TextBlock } from "@/lib/types"
import { releaseVram, runOcr, runPageAutoDetect } from "@/lib/api"
import { runConcurrent } from "./concurrent-pool"
import type { PagePipelineContext } from "./types"

export async function executeAutoDetect(ctx: PagePipelineContext): Promise<void> {
  const {
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    globalSettings,
    setSelectedId,
    onPageStatusUpdate,
    setIsDetecting,
  } = ctx
  const currentPage = ctx.currentPage
  if (!currentPage) return

  if (textBlocks.length > 0 || (currentPage.status !== "raw" && currentPage.status !== "new")) {
    const ok = confirm("Пересканировать страницу с нуля? Текущие баблы будут заменены.")
    if (!ok) return
  }

  setIsDetecting(true)
  try {
    const detectRes = await runPageAutoDetect(
      currentPage.id,
      globalSettings.detect_conf,
      false
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

    const newBlocks: TextBlock[] = boxes.map((box: any) => ({
      id: box.id || crypto.randomUUID(),
      class_id: box.class_id ?? 0,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rotation: 0,
      japText: box.jap_text || "",
      rusText: "",
      orderIndex: box.order_index,
      fontSize: box.font_size !== undefined && box.font_size !== null ? Number(box.font_size) : undefined,
      fontFamily: box.font_family || globalSettings.font_bubble || "v_CCFaceFront",
      textColor: "black",
      shape: "rect",
      paddingMode: box.padding_mode || globalSettings.default_padding || "safe",
      minHyphens: box.min_hyphens !== undefined ? Boolean(box.min_hyphens) : (globalSettings.default_hyphenation ?? true),
      status: (box.status as TextBlock["status"]) || (box.jap_text ? "ocr-done" : "new"),
    }))

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

export async function executeOcrAllBlocks(ctx: PagePipelineContext): Promise<void> {
  const {
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    saveBlocks,
    setIsOcrRunning,
  } = ctx
  const currentPage = ctx.currentPage
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
    releaseVram()
    setIsOcrRunning(false)
  }
}

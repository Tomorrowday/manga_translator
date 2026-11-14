// manga_ui/hooks/pipelines/translate-pipeline.ts
// Локальный перевод через Ollama с дораспознаванием пустых баблов

import { releaseVram, runOcr } from "@/lib/api"
import { runOllamaBatchTranslate, checkOllamaConnection } from "@/lib/api/ollama"
import { runConcurrent } from "./concurrent-pool"
import type { PagePipelineContext } from "./types"

export async function executeTranslateAll(ctx: PagePipelineContext): Promise<void> {
  const {
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    globalSettings,
    saveBlocks,
    onPageStatusUpdate,
    setShowTypeset,
    setIsBatchTranslating,
  } = ctx
  const currentPage = ctx.currentPage
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
      .map((b) => ({
        id: b.id,
        text: b.japText,
        speaker: b.speaker,
        class_id: b.class_id ?? 0,
      }))

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

    const autoOval = globalSettings.auto_oval_bubble ?? true
    const updated = blocksToOcr.map((b) => {
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

    setTextBlocks(updated)
    textBlocksRef.current = updated
    await saveBlocks(true)

    setShowTypeset(true)
    onPageStatusUpdate(currentPage.id, "translated")
  } catch (e) {
    console.error(e)
    alert("Ошибка при локальном переводе: " + String(e))
  } finally {
    releaseVram()
    setIsBatchTranslating(false)
  }
}

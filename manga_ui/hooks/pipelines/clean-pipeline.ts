// manga_ui/hooks/pipelines/clean-pipeline.ts
// Очистка страницы (клин) и откат клина к исходному скану

import { revertCleanPage, runCleanPage } from "@/lib/api"
import type { PageStatus } from "@/lib/types"
import type { PagePipelineContext } from "./types"

export async function executeCleanPage(
  ctx: PagePipelineContext,
  mode: "auto" | "lama" | "white" = "auto"
): Promise<void> {
  const {
    textBlocks,
    saveBlocks,
    setViewMode,
    onPageStatusUpdate,
    setIsCleaning,
  } = ctx
  const currentPage = ctx.currentPage
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

export async function executeRevertClean(ctx: PagePipelineContext): Promise<void> {
  const {
    setCurrentPage,
    setViewMode,
    onPageStatusUpdate,
    setIsRevertingClean,
  } = ctx
  const currentPage = ctx.currentPage
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

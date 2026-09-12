// hooks/use-page-blocks.ts
// Управление состоянием и операциями над текстовыми блоками страницы

import { useState, useRef, useCallback } from "react"
import type { TextBlock, PageItem, PageStatus } from "@/lib/types"
import { cropRegion } from "@/lib/typeset"
import { savePageBlocks, runSpotClean } from "@/lib/api"

export interface DrawRect {
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

export function usePageBlocks(
  currentPage: PageItem | null,
  onPageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void,
  onRefreshSpeakers: (pageId: number) => void
) {
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const textBlocksRef = useRef<TextBlock[]>([])
  textBlocksRef.current = textBlocks
  const currentPageRef = useRef<PageItem | null>(null)
  currentPageRef.current = currentPage

  const saveBlocks = useCallback(
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
          onPageStatusUpdate(currentPageRef.current.id, res.page_status)
        }

        if (refreshSpeakers && currentPageRef.current) {
          onRefreshSpeakers(currentPageRef.current.id)
        }
      } catch (e) {
        console.error("Ошибка сохранения блоков:", e)
      } finally {
        setIsSaving(false)
      }
    },
    [onPageStatusUpdate, onRefreshSpeakers]
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

  const spotCleanBlock = useCallback(
    async (block: TextBlock, method: "auto" | "lama" | "white" = "auto", deleteAfter = false) => {
      if (!currentPageRef.current) return
      try {
        const res = await runSpotClean(
          currentPageRef.current.id,
          { x: block.x, y: block.y, width: block.width, height: block.height },
          method
        )
        if (res.success) {
          onPageStatusUpdate(currentPageRef.current.id, res.page_status || "cleaned", res.clean_path)
          if (deleteAfter) deleteBlock(block.id)
        } else {
          alert("Ошибка точечного клина: " + (res.error || "Неизвестная ошибка"))
        }
      } catch (e) {
        alert("Ошибка точечного клина: " + String(e))
      }
    },
    [onPageStatusUpdate, deleteBlock]
  )

  const addOrUpdateDrawnBlock = useCallback(
    async (rect: DrawRect, img: HTMLImageElement, existingId?: string, rotation?: number) => {
      const rot = rotation !== undefined ? rotation : rect.rotation || 0
      const { dataUrl } = await cropRegion(img, { ...rect, rotation: rot })

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
        if (prev.length === 0) return [{ ...newBlock, orderIndex: 1 }]

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

  return {
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    selectedId,
    setSelectedId,
    isSaving,
    saveBlocks,
    updateBlock,
    deleteBlock,
    moveBlock,
    spotCleanBlock,
    addOrUpdateDrawnBlock,
  }
}
// manga_ui/hooks/use-page-blocks.ts
// Управление блоками страницы: новые баблы создаются строго в режиме Auto

import { useState, useRef, useCallback } from "react"
import type { TextBlock, PageItem, PageStatus, TitleSettings } from "@/lib/types"
import { cropRegion, insertBlockInMangaOrder } from "@/lib/typeset"
import { savePageBlocks, runSpotClean } from "@/lib/api"

export interface DrawRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export function usePageBlocks(
  currentPage: PageItem | null,
  globalSettings: TitleSettings,
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

  const isDirtyRef = useRef(false)

  const saveBlocksExplicit = useCallback(
    async (targetPageId: number, blocksToSave: TextBlock[], refreshSpeakers = true) => {
      setIsSaving(true)
      try {
        const payload = blocksToSave.map((b) => ({
          id: b.id,
          class_id: b.class_id ?? 0,
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
          text_color: b.textColor || "black",
          shape: b.shape || "rect",
          padding_mode: b.paddingMode || "safe",
          min_hyphens: b.minHyphens !== undefined ? b.minHyphens : true,
          status: b.status,
        }))

        const res = await savePageBlocks(targetPageId, payload)
        if (res.page_status) {
          onPageStatusUpdate(targetPageId, res.page_status)
        }

        if (refreshSpeakers) {
          onRefreshSpeakers(targetPageId)
        }

        isDirtyRef.current = false
      } catch (e) {
        console.error("Ошибка сохранения блоков страницы", targetPageId, e)
        throw e
      } finally {
        setIsSaving(false)
      }
    },
    [onPageStatusUpdate, onRefreshSpeakers]
  )

  const saveBlocks = useCallback(
    async (refreshSpeakers = true) => {
      if (!currentPageRef.current) return
      await saveBlocksExplicit(currentPageRef.current.id, textBlocksRef.current, refreshSpeakers)
    },
    [saveBlocksExplicit]
  )

  const setNewPageBlocks = useCallback((newBlocks: TextBlock[]) => {
    setTextBlocks(newBlocks)
    textBlocksRef.current = newBlocks
    isDirtyRef.current = false
  }, [])

  const clearBlocks = useCallback(() => {
    setTextBlocks([])
    textBlocksRef.current = []
    setSelectedId(null)
    isDirtyRef.current = false
  }, [])

  const updateBlock = useCallback((id: string, patch: Partial<TextBlock>) => {
    isDirtyRef.current = true
    setTextBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }, [])

  const deleteBlock = useCallback((id: string) => {
    isDirtyRef.current = true
    setTextBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      const filtered = prev.filter((b) => b.id !== id)
      const updated = filtered.map((b, i) => ({ ...b, orderIndex: i + 1 }))

      setSelectedId((cur) => {
        if (cur !== id) return cur
        if (updated.length === 0) return null
        const nextIdx = Math.min(Math.max(0, idx), updated.length - 1)
        return updated[nextIdx].id
      })

      return updated
    })
  }, [])

  const moveBlock = useCallback((id: string, direction: "up" | "down") => {
    isDirtyRef.current = true
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
          {
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
            rotation: block.rotation || 0.0,
            shape: block.shape || "rect",
          },
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
      isDirtyRef.current = true
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

      // Новая нарисованная рамка по умолчанию ВСЕГДА Auto (fontSize: undefined)
      const defaultFont = globalSettings.font_bubble || "v_CCFaceFront"
      const defaultPadding = globalSettings.default_padding || "safe"
      const defaultHyphens = globalSettings.default_hyphenation !== undefined ? globalSettings.default_hyphenation : true

      const id = crypto.randomUUID()
      const newBlock: TextBlock = {
        id,
        class_id: 0,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotation: rot,
        imageCrop: dataUrl,
        japText: "",
        rusText: "",
        fontSize: undefined, // ПО УМОЛЧАНИЮ ВСЕГДА AUTO
        fontFamily: defaultFont,
        textColor: "black",
        shape: "rect",
        paddingMode: defaultPadding,
        minHyphens: defaultHyphens,
        status: "new",
      }

      setTextBlocks((prev) => insertBlockInMangaOrder(prev, newBlock))
      setSelectedId(id)
    },
    [globalSettings]
  )

  return {
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
  }
}
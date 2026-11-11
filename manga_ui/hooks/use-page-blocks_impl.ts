// manga_ui/hooks/use-page-blocks_impl.ts
// Управление блоками страницы со стеком истории Undo / Redo (до 30 шагов) и откатом шага клина

import { useState, useRef, useCallback } from "react"
import type { TextBlock, PageItem, PageStatus, TitleSettings } from "@/lib/types"
import { insertBlockInMangaOrder } from "@/lib/typeset"
import { savePageBlocks, runSpotClean, undoLastCleanStep } from "@/lib/api"
import type { DrawRect, UsePageBlocksReturn } from "./use-page-blocks"

const MAX_HISTORY_STEPS = 30

interface HistorySnapshot {
  blocks: TextBlock[]
  selectedId: string | null
  hasCleanStep?: boolean
}

function cloneBlocks(blocks: TextBlock[]): TextBlock[] {
  return blocks.map((b) => ({ ...b }))
}

export function usePageBlocks(
  currentPage: PageItem | null,
  globalSettings: TitleSettings,
  onPageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void,
  onRefreshSpeakers: (pageId: number) => void
): UsePageBlocksReturn {
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const textBlocksRef = useRef<TextBlock[]>([])
  textBlocksRef.current = textBlocks
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const currentPageRef = useRef<PageItem | null>(null)
  currentPageRef.current = currentPage

  const isDirtyRef = useRef(false)
  const undoStackRef = useRef<HistorySnapshot[]>([])
  const redoStackRef = useRef<HistorySnapshot[]>([])

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }, [])

  const resetHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    syncHistoryFlags()
  }, [syncHistoryFlags])

  const pushUndoSnapshot = useCallback(
    (hasCleanStep = false) => {
      const snap: HistorySnapshot = {
        blocks: cloneBlocks(textBlocksRef.current),
        selectedId: selectedIdRef.current,
        hasCleanStep,
      }
      undoStackRef.current.push(snap)
      if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
        undoStackRef.current.shift()
      }
      redoStackRef.current = []
      syncHistoryFlags()
    },
    [syncHistoryFlags]
  )

  const recordCleanAction = useCallback(() => {
    pushUndoSnapshot(true)
  }, [pushUndoSnapshot])

  const undo = useCallback(async () => {
    if (undoStackRef.current.length === 0) return
    const snapshot = undoStackRef.current.pop()!

    redoStackRef.current.push({
      blocks: cloneBlocks(textBlocksRef.current),
      selectedId: selectedIdRef.current,
      hasCleanStep: false,
    })
    if (redoStackRef.current.length > MAX_HISTORY_STEPS) {
      redoStackRef.current.shift()
    }

    isDirtyRef.current = true
    const restored = cloneBlocks(snapshot.blocks)
    setTextBlocks(restored)
    textBlocksRef.current = restored
    setSelectedId(snapshot.selectedId)
    selectedIdRef.current = snapshot.selectedId
    syncHistoryFlags()

    if (snapshot.hasCleanStep && currentPageRef.current) {
      try {
        const res = await undoLastCleanStep(currentPageRef.current.id)
        if (res?.success) {
          onPageStatusUpdate(
            currentPageRef.current.id,
            (res.page_status as PageStatus) || "cleaned",
            res.clean_path ?? ""
          )
        }
      } catch (e) {
        console.warn("Не удалось откатить шаг клина на бэкенде:", e)
      }
    }
  }, [onPageStatusUpdate, syncHistoryFlags])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    const nextSnap = redoStackRef.current.pop()!

    undoStackRef.current.push({
      blocks: cloneBlocks(textBlocksRef.current),
      selectedId: selectedIdRef.current,
      hasCleanStep: false,
    })
    if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
      undoStackRef.current.shift()
    }

    isDirtyRef.current = true
    const restored = cloneBlocks(nextSnap.blocks)
    setTextBlocks(restored)
    textBlocksRef.current = restored
    setSelectedId(nextSnap.selectedId)
    selectedIdRef.current = nextSnap.selectedId
    syncHistoryFlags()
  }, [syncHistoryFlags])

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
          font_size: b.fontSize !== undefined && b.fontSize !== null ? Number(b.fontSize) : undefined,
          font_family: b.fontFamily || "v_CCFaceFront",
          is_bold: Boolean(b.isBold),
          is_italic: Boolean(b.isItalic),
          is_uppercase: Boolean(b.isUppercase),
          has_stroke: Boolean(b.hasStroke),
          text_color: b.textColor || "black",
          shape: b.shape || "rect",
          padding_mode: b.paddingMode || "safe",
          min_hyphens: b.minHyphens !== undefined ? Boolean(b.minHyphens) : true,
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

  const setNewPageBlocks = useCallback(
    (newBlocks: TextBlock[]) => {
      const sanitized = newBlocks.map((b) => ({
        ...b,
        fontSize: b.fontSize != null ? Number(b.fontSize) : undefined,
      }))
      setTextBlocks(sanitized)
      textBlocksRef.current = sanitized
      isDirtyRef.current = false
      resetHistory()
    },
    [resetHistory]
  )

  const clearBlocks = useCallback(() => {
    setTextBlocks([])
    textBlocksRef.current = []
    setSelectedId(null)
    selectedIdRef.current = null
    isDirtyRef.current = false
    resetHistory()
  }, [resetHistory])

  const updateBlock = useCallback(
    (id: string, patch: Partial<TextBlock>) => {
      pushUndoSnapshot(false)
      isDirtyRef.current = true
      setTextBlocks((prev) => {
        const next = prev.map((b) => {
          if (b.id !== id) return b
          const updated = { ...b, ...patch }
          if (patch.fontSize === null) {
            updated.fontSize = undefined
          }
          return updated
        })
        textBlocksRef.current = next
        return next
      })
    },
    [pushUndoSnapshot]
  )

  const deleteBlock = useCallback(
    (id: string) => {
      pushUndoSnapshot(false)
      isDirtyRef.current = true
      setTextBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        const filtered = prev.filter((b) => b.id !== id)
        const updated = filtered.map((b, i) => ({ ...b, orderIndex: i + 1 }))
        textBlocksRef.current = updated

        setSelectedId((cur) => {
          if (cur !== id) return cur
          if (updated.length === 0) {
            selectedIdRef.current = null
            return null
          }
          const nextIdx = Math.min(Math.max(0, idx), updated.length - 1)
          const nextSelected = updated[nextIdx].id
          selectedIdRef.current = nextSelected
          return nextSelected
        })

        return updated
      })
    },
    [pushUndoSnapshot]
  )

  const moveBlock = useCallback(
    (id: string, direction: "up" | "down") => {
      const currentList = textBlocksRef.current
      const idx = currentList.findIndex((b) => b.id === id)
      if (idx < 0) return
      const swapWith = direction === "up" ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= currentList.length) return

      pushUndoSnapshot(false)
      isDirtyRef.current = true
      setTextBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === id)
        if (i < 0) return prev
        const target = direction === "up" ? i - 1 : i + 1
        if (target < 0 || target >= prev.length) return prev
        const next = [...prev]
        ;[next[i], next[target]] = [next[target], next[i]]
        const reindexed = next.map((b, index) => ({ ...b, orderIndex: index + 1 }))
        textBlocksRef.current = reindexed
        return reindexed
      })
    },
    [pushUndoSnapshot]
  )

  const spotCleanBlock = useCallback(
    async (block: TextBlock, method: "auto" | "lama" | "white" = "auto", deleteAfter = false) => {
      if (!currentPageRef.current) return
      try {
        pushUndoSnapshot(true)
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
          if (deleteAfter) {
            isDirtyRef.current = true
            setTextBlocks((prev) => {
              const idx = prev.findIndex((b) => b.id === block.id)
              const filtered = prev.filter((b) => b.id !== block.id)
              const updated = filtered.map((b, i) => ({ ...b, orderIndex: i + 1 }))
              textBlocksRef.current = updated
              setSelectedId((cur) => {
                if (cur !== block.id) return cur
                if (updated.length === 0) return null
                const nextIdx = Math.min(Math.max(0, idx), updated.length - 1)
                return updated[nextIdx].id
              })
              return updated
            })
          }
        } else {
          undoStackRef.current.pop()
          syncHistoryFlags()
          alert("Ошибка точечного клина: " + (res.error || "Неизвестная ошибка"))
        }
      } catch (e) {
        undoStackRef.current.pop()
        syncHistoryFlags()
        alert("Ошибка точечного клина: " + String(e))
      }
    },
    [onPageStatusUpdate, pushUndoSnapshot, syncHistoryFlags]
  )

  const addOrUpdateDrawnBlock = useCallback(
    async (rect: DrawRect, _img: HTMLImageElement, existingId?: string, rotation?: number) => {
      pushUndoSnapshot(false)
      isDirtyRef.current = true
      const rot = rotation !== undefined ? rotation : rect.rotation || 0

      if (existingId) {
        setTextBlocks((prev) => {
          const next = prev.map((b) =>
            b.id === existingId
              ? {
                  ...b,
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  rotation: rot,
                }
              : b
          )
          textBlocksRef.current = next
          return next
        })
        return
      }

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
        japText: "",
        rusText: "",
        fontSize: undefined,
        fontFamily: defaultFont,
        textColor: "black",
        shape: "rect",
        paddingMode: defaultPadding,
        minHyphens: defaultHyphens,
        status: "new",
      }

      setTextBlocks((prev) => {
        const next = insertBlockInMangaOrder(prev, newBlock)
        textBlocksRef.current = next
        return next
      })
      setSelectedId(id)
      selectedIdRef.current = id
    },
    [globalSettings, pushUndoSnapshot]
  )

  return {
    textBlocks,
    setTextBlocks,
    textBlocksRef,
    selectedId,
    setSelectedId,
    isSaving,
    isDirtyRef,
    canUndo,
    canRedo,
    undo,
    redo,
    recordCleanAction,
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
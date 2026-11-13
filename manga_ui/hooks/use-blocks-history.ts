// manga_ui/hooks/use-blocks-history.ts
// Стек истории Undo / Redo (до 30 шагов) и откат шага клина на бэкенде

import { useState, useRef, useCallback } from "react"
import type { PageItem, PageStatus, TextBlock } from "@/lib/types"
import { undoLastCleanStep } from "@/lib/api"

const MAX_HISTORY_STEPS = 30

interface HistorySnapshot {
  blocks: TextBlock[]
  selectedId: string | null
  hasCleanStep?: boolean
}

function cloneBlocks(blocks: TextBlock[]): TextBlock[] {
  return blocks.map((b) => ({ ...b }))
}

export interface UseBlocksHistoryProps {
  textBlocksRef: React.MutableRefObject<TextBlock[]>
  selectedIdRef: React.MutableRefObject<string | null>
  currentPageRef: React.MutableRefObject<PageItem | null>
  setTextBlocks: React.Dispatch<React.SetStateAction<TextBlock[]>>
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>
  isDirtyRef: React.MutableRefObject<boolean>
  onPageStatusUpdate: (pageId: number, status: PageStatus, cleanPath?: string) => void
}

export interface UseBlocksHistoryReturn {
  canUndo: boolean
  canRedo: boolean
  pushUndoSnapshot: (hasCleanStep?: boolean) => void
  recordCleanAction: () => void
  undo: () => Promise<void>
  redo: () => void
  resetHistory: () => void
  discardLastSnapshot: () => void
}

export function useBlocksHistory({
  textBlocksRef,
  selectedIdRef,
  currentPageRef,
  setTextBlocks,
  setSelectedId,
  isDirtyRef,
  onPageStatusUpdate,
}: UseBlocksHistoryProps): UseBlocksHistoryReturn {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

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
    [syncHistoryFlags, textBlocksRef, selectedIdRef]
  )

  const recordCleanAction = useCallback(() => {
    pushUndoSnapshot(true)
  }, [pushUndoSnapshot])

  const discardLastSnapshot = useCallback(() => {
    undoStackRef.current.pop()
    syncHistoryFlags()
  }, [syncHistoryFlags])

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
  }, [
    onPageStatusUpdate,
    syncHistoryFlags,
    textBlocksRef,
    selectedIdRef,
    currentPageRef,
    setTextBlocks,
    setSelectedId,
    isDirtyRef,
  ])

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
  }, [syncHistoryFlags, textBlocksRef, selectedIdRef, setTextBlocks, setSelectedId, isDirtyRef])

  return {
    canUndo,
    canRedo,
    pushUndoSnapshot,
    recordCleanAction,
    undo,
    redo,
    resetHistory,
    discardLastSnapshot,
  }
}

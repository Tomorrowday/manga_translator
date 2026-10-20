// manga_ui/components/text-blocks-list.tsx

"use client"

import { useCallback } from "react"
import { BookText, Layers } from "lucide-react"
import type { TextBlock, PageItem } from "@/lib/types"
import { TextBlockCard } from "@/components/text-block-card"

interface TextBlocksListProps {
  currentPage: PageItem | null
  textBlocks: TextBlock[]
  selectedId: string | null
  defaultFontSize?: number
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<TextBlock>) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onSpotClean: (block: TextBlock, method: "auto" | "lama" | "white", deleteAfter?: boolean) => Promise<void>
}

export function TextBlocksList({
  currentPage,
  textBlocks,
  selectedId,
  defaultFontSize = 14,
  onSelect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onSpotClean,
}: TextBlocksListProps) {
  const handleSpotClean = useCallback(
    (block: TextBlock, method: "auto" | "lama" | "white", deleteAfter?: boolean) => {
      return onSpotClean(block, method, deleteAfter)
    },
    [onSpotClean]
  )

  if (!currentPage) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center text-slate-600">
        <BookText className="h-8 w-8" />
        <p className="text-sm font-medium text-slate-500">No page selected</p>
        <p className="max-w-[220px] text-xs">
          Choose a chapter page from the explorer to see text blocks.
        </p>
      </div>
    )
  }

  if (textBlocks.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center text-slate-600">
        <Layers className="h-8 w-8" />
        <p className="text-sm font-medium text-slate-500">No text blocks yet</p>
        <p className="max-w-[220px] text-xs">
          Click &ldquo;1. Detect & OCR&rdquo; or drag a rectangle over a speech bubble.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      {textBlocks.map((block, index) => (
        <TextBlockCard
          key={block.id}
          block={block}
          index={index}
          pageId={currentPage.id}
          defaultFontSize={defaultFontSize}
          isSelected={block.id === selectedId}
          onSelect={() => onSelect(block.id)}
          onChange={(patch) => onUpdate(block.id, patch)}
          onDelete={() => onDelete(block.id)}
          onMoveUp={() => onMoveUp(block.id)}
          onMoveDown={() => onMoveDown(block.id)}
          canMoveUp={index > 0}
          canMoveDown={index < textBlocks.length - 1}
          onSpotClean={(method, deleteAfter) => handleSpotClean(block, method, deleteAfter)}
        />
      ))}
    </div>
  )
}
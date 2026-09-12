// hooks/use-box-transform.ts
// Логика перетаскивания, 8-точечного масштабирования и вращения баблов

import { useState, useEffect, useCallback } from "react"
import type { TextBlock } from "@/lib/types"

export type ResizeDirection = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se"
export type EditAction = "move" | "rotate" | ResizeDirection

export interface DrawRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

const MIN_BLOCK_SIZE = 0.008

export function useBoxTransform(
  imgRef: React.RefObject<HTMLImageElement | null>,
  pointFromEvent: (e: React.MouseEvent | MouseEvent) => { x: number; y: number } | null,
  onTransformComplete: (rect: DrawRect, img: HTMLImageElement, id: string, rotation: number) => void
) {
  const [isEditing, setIsEditing] = useState(false)
  const [editType, setEditType] = useState<EditAction | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [originalBox, setOriginalBox] = useState<DrawRect | null>(null)
  const [activeBox, setActiveBox] = useState<DrawRect | null>(null)
  const [activeRotation, setActiveRotation] = useState<number>(0)

  const startTransform = useCallback(
    (e: React.MouseEvent, box: TextBlock, action: EditAction) => {
      const p = pointFromEvent(e)
      if (!p) return

      setIsEditing(true)
      setEditType(action)
      setEditId(box.id)
      setStartPoint(p)
      const initialRect: DrawRect = {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rotation: box.rotation || 0,
      }
      setOriginalBox(initialRect)
      setActiveBox(initialRect)
      setActiveRotation(box.rotation || 0)
    },
    [pointFromEvent]
  )

  const computeUpdatedRect = useCallback((orig: DrawRect, action: EditAction, dx: number, dy: number): DrawRect => {
    const updated = { ...orig }
    const currentRot = orig.rotation || 0

    if (action === "move") {
      updated.x = Math.max(0, Math.min(1 - orig.width, orig.x + dx))
      updated.y = Math.max(0, Math.min(1 - orig.height, orig.y + dy))
      return updated
    }

    let localDx = dx
    let localDy = dy

    if (Math.abs(currentRot) >= 0.5) {
      const rad = (-currentRot * Math.PI) / 180
      localDx = dx * Math.cos(rad) - dy * Math.sin(rad)
      localDy = dx * Math.sin(rad) + dy * Math.cos(rad)
    }

    if (action === "e" || action === "ne" || action === "se") {
      updated.width = Math.max(MIN_BLOCK_SIZE, Math.min(1 - orig.x, orig.width + localDx))
    } else if (action === "w" || action === "nw" || action === "sw") {
      const rightEdge = orig.x + orig.width
      const targetX = Math.max(0, Math.min(rightEdge - MIN_BLOCK_SIZE, orig.x + localDx))
      updated.x = targetX
      updated.width = rightEdge - targetX
    }

    if (action === "s" || action === "se" || action === "sw") {
      updated.height = Math.max(MIN_BLOCK_SIZE, Math.min(1 - orig.y, orig.height + localDy))
    } else if (action === "n" || action === "ne" || action === "nw") {
      const bottomEdge = orig.y + orig.height
      const targetY = Math.max(0, Math.min(bottomEdge - MIN_BLOCK_SIZE, orig.y + localDy))
      updated.y = targetY
      updated.height = bottomEdge - targetY
    }

    return updated
  }, [])

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isEditing || !editId || !startPoint || !originalBox || !editType || !imgRef.current) return
      const p = pointFromEvent(e)
      if (!p) return

      if (editType === "rotate") {
        const cx = originalBox.x + originalBox.width / 2
        const cy = originalBox.y + originalBox.height / 2
        const imgRect = imgRef.current.getBoundingClientRect()
        const px = (p.x - cx) * imgRect.width
        const py = (p.y - cy) * imgRect.height

        let deg = (Math.atan2(py, px) * 180) / Math.PI + 90
        deg = ((deg + 180) % 360) - 180

        if (Math.abs(deg) < 2.0) deg = 0

        setActiveRotation(deg)
        return
      }

      const dx = p.x - startPoint.x
      const dy = p.y - startPoint.y
      const updated = computeUpdatedRect(originalBox, editType, dx, dy)
      setActiveBox(updated)
    }

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!isEditing || !editId || !startPoint || !originalBox || !imgRef.current || !editType) return

      const p = pointFromEvent(e)
      if (p) {
        if (editType === "rotate") {
          const finalRot = Math.round(activeRotation * 10) / 10
          onTransformComplete(originalBox, imgRef.current, editId, finalRot)
        } else {
          const dx = p.x - startPoint.x
          const dy = p.y - startPoint.y
          const finalRect = computeUpdatedRect(originalBox, editType, dx, dy)
          onTransformComplete(finalRect, imgRef.current, editId, originalBox.rotation || 0)
        }
      }

      setIsEditing(false)
      setEditType(null)
      setEditId(null)
      setStartPoint(null)
      setOriginalBox(null)
      setActiveBox(null)
    }

    if (isEditing) {
      window.addEventListener("mousemove", handleGlobalMouseMove)
      window.addEventListener("mouseup", handleGlobalMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [
    isEditing,
    editId,
    startPoint,
    originalBox,
    editType,
    activeRotation,
    imgRef,
    pointFromEvent,
    computeUpdatedRect,
    onTransformComplete,
  ])

  return {
    isEditing,
    editId,
    editType,
    activeBox,
    activeRotation,
    startTransform,
  }
}
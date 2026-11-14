// manga_ui/hooks/use-panel-resize.ts
// Изменение ширины правой панели мышью с сохранением в localStorage

import { useState, useEffect, useCallback } from "react"

const RIGHT_PANEL_STORAGE_KEY = "manga_right_panel_width"
export const DEFAULT_PANEL_WIDTH = 490

export interface UsePanelResizeReturn {
  panelWidth: number
  isResizing: boolean
  startResizing: (e: React.MouseEvent) => void
}

export function usePanelResize(): UsePanelResizeReturn {
  const [panelWidth, setPanelWidth] = useState<number>(DEFAULT_PANEL_WIDTH)
  const [isResizing, setIsResizing] = useState<boolean>(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RIGHT_PANEL_STORAGE_KEY)
      if (saved) {
        const val = parseInt(saved, 10)
        if (!isNaN(val) && val >= 360 && val <= 1000) {
          setPanelWidth(val)
        }
      }
    } catch {}
  }, [])

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      const minW = 360
      const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.55))
      const clamped = Math.min(Math.max(newWidth, minW), maxW)
      setPanelWidth(clamped)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setPanelWidth((latest) => {
        try {
          localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(latest))
        } catch {}
        return latest
      })
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])

  return { panelWidth, isResizing, startResizing }
}

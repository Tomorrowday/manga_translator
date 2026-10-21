// manga_ui/hooks/use-brush-tool.ts
// Управление холстом кисти, отрисовкой мазков и генерацией маски для LaMa

import { useRef, useState, useCallback, useEffect } from "react"

export type BrushMode = "lama" | "white" | "black"

interface UseBrushToolProps {
  imgRef: React.RefObject<HTMLImageElement | null>
  brushSize: number
  brushMode: BrushMode
  imageSrc: string | null
  onBrushClean?: (maskBase64: string, mode: BrushMode) => Promise<void>
}

export function useBrushTool({
  imgRef,
  brushSize,
  brushMode,
  imageSrc,
  onBrushClean,
}: UseBrushToolProps) {
  const brushCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)

  const [isBrushPainting, setIsBrushPainting] = useState<boolean>(false)
  const [isBrushProcessing, setIsBrushProcessing] = useState<boolean>(false)

  const syncBrushCanvasSize = useCallback(() => {
    const canvas = brushCanvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    if (canvas.width !== img.clientWidth || canvas.height !== img.clientHeight) {
      canvas.width = img.clientWidth
      canvas.height = img.clientHeight
    }
  }, [imgRef])

  useEffect(() => {
    syncBrushCanvasSize()
    window.addEventListener("resize", syncBrushCanvasSize)
    return () => window.removeEventListener("resize", syncBrushCanvasSize)
  }, [syncBrushCanvasSize, imageSrc])

  const getBrushStrokeStyle = useCallback(() => {
    if (brushMode === "white") return "rgba(255, 255, 255, 0.95)"
    if (brushMode === "black") return "rgba(0, 0, 0, 0.95)"
    return "rgba(236, 72, 153, 0.65)"
  }, [brushMode])

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = brushCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const handleBrushMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isBrushProcessing || !onBrushClean) return
      syncBrushCanvasSize()
      const canvas = brushCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      setIsBrushPainting(true)
      const { x, y } = getCanvasCoords(e)

      if (cursorRef.current) {
        cursorRef.current.style.display = "block"
        cursorRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      }

      const color = getBrushStrokeStyle()
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = brushSize
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      ctx.beginPath()
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(x, y)
    },
    [isBrushProcessing, onBrushClean, syncBrushCanvasSize, getCanvasCoords, getBrushStrokeStyle, brushSize]
  )

  const handleBrushMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e)

      if (cursorRef.current) {
        cursorRef.current.style.display = "block"
        cursorRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      }

      if (isBrushPainting) {
        const canvas = brushCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        ctx.lineTo(x, y)
        ctx.stroke()
      }
    },
    [getCanvasCoords, isBrushPainting]
  )

  const handleBrushMouseUp = useCallback(async () => {
    if (!isBrushPainting) return
    setIsBrushPainting(false)

    const screenCanvas = brushCanvasRef.current
    const img = imgRef.current
    if (!screenCanvas || !img || !onBrushClean) return

    setIsBrushProcessing(true)

    try {
      const offscreen = document.createElement("canvas")
      offscreen.width = img.naturalWidth
      offscreen.height = img.naturalHeight
      const oCtx = offscreen.getContext("2d")

      if (oCtx) {
        oCtx.clearRect(0, 0, offscreen.width, offscreen.height)
        const scaleX = img.naturalWidth / screenCanvas.width
        const scaleY = img.naturalHeight / screenCanvas.height

        oCtx.save()
        oCtx.scale(scaleX, scaleY)
        oCtx.drawImage(screenCanvas, 0, 0)
        oCtx.restore()

        const imgData = oCtx.getImageData(0, 0, offscreen.width, offscreen.height)
        const d = imgData.data

        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 15) {
            d[i] = 255
            d[i + 1] = 255
            d[i + 2] = 255
            d[i + 3] = 255
          } else {
            d[i] = 0
            d[i + 1] = 0
            d[i + 2] = 0
            d[i + 3] = 255
          }
        }
        oCtx.putImageData(imgData, 0, 0)

        const maskBase64 = offscreen.toDataURL("image/png")
        const sCtx = screenCanvas.getContext("2d")
        sCtx?.clearRect(0, 0, screenCanvas.width, screenCanvas.height)

        await onBrushClean(maskBase64, brushMode)
      }
    } catch (err) {
      console.error("Ошибка применения кисти:", err)
    } finally {
      setIsBrushProcessing(false)
    }
  }, [isBrushPainting, imgRef, onBrushClean, brushMode])

  const handleBrushMouseLeave = useCallback(() => {
    if (cursorRef.current) {
      cursorRef.current.style.display = "none"
    }
    if (isBrushPainting) {
      handleBrushMouseUp()
    }
  }, [isBrushPainting, handleBrushMouseUp])

  return {
    brushCanvasRef,
    cursorRef,
    isBrushProcessing,
    handleBrushMouseDown,
    handleBrushMouseMove,
    handleBrushMouseUp,
    handleBrushMouseLeave,
  }
}
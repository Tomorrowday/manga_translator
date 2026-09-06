"use client"

import type React from "react"
import { useRef, useState, useCallback, useEffect } from "react"
import { ImagePlus, MousePointerSquareDashed } from "lucide-react"
import type { TextBlock } from "@/lib/types"

interface DrawRect {
  x: number
  y: number
  width: number
  height: number
}

interface ImageViewerProps {
  imageSrc: string | null
  textBlocks: TextBlock[]
  selectedId: string | null
  showTypeset?: boolean
  onSelect: (id: string | null) => void
  onImageLoad: (src: string) => void
  onDrawComplete: (rect: DrawRect, img: HTMLImageElement, existingId?: string) => void
}

function normalize(a: number, b: number) {
  return { start: Math.min(a, b), size: Math.abs(a - b) }
}

export function ImageViewer({
  imageSrc,
  textBlocks,
  selectedId,
  showTypeset = false,
  onSelect,
  onImageLoad,
  onDrawComplete,
}: ImageViewerProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<DrawRect | null>(null)

  // Состояния для редактирования существующего блока
  const [isEditing, setIsEditing] = useState(false);
  const [editType, setEditType] = useState<"move" | "resize" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null);
  const [originalBox, setOriginalBox] = useState<DrawRect | null>(null);


  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !/(image\/jpe?g|image\/png)/.test(file.type)) return
      const reader = new FileReader()
      reader.onload = () => onImageLoad(reader.result as string)
      reader.readAsDataURL(file)
    },
    [onImageLoad],
  )

  const pointFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
    return { x, y }
  }, [])

  // Начало рисования нового блока
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc || isEditing) return
    const p = pointFromEvent(e)
    if (!p) return
    onSelect(null)
    setOrigin(p)
    setDraft({ x: p.x, y: p.y, width: 0, height: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!origin) return
    const p = pointFromEvent(e)
    if (!p) return
    const hx = normalize(origin.x, p.x)
    const hy = normalize(origin.y, p.y)
    setDraft({ x: hx.start, y: hy.start, width: hx.size, height: hy.size })
  }

  const finishDraw = () => {
    if (draft && imgRef.current && draft.width > 0.01 && draft.height > 0.01) {
      onDrawComplete(draft, imgRef.current)
    }
    setOrigin(null)
    setDraft(null)
  }

  // Функции для редактирования блоков (Drag & Drop, Resize)
  const handleBoxMouseDown = (e: React.MouseEvent, box: TextBlock, action: "move" | "resize") => {
    e.stopPropagation();
    onSelect(box.id);
    const p = pointFromEvent(e);
    if (!p) return;

    setIsEditing(true);
    setEditType(action);
    setEditId(box.id);
    setStartPoint(p);
    setOriginalBox({ x: box.x, y: box.y, width: box.width, height: box.height });
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isEditing || !editId || !startPoint || !originalBox) return;
      const p = pointFromEvent(e);
      if (!p) return;

      const dx = p.x - startPoint.x;
      const dy = p.y - startPoint.y;

      // Визуально обновляем через React State (чтобы не дергать бэкенд на каждый пиксель)
      const boxElement = document.getElementById(`box-${editId}`);
      if (boxElement) {
        if (editType === "move") {
           boxElement.style.left = `${(originalBox.x + dx) * 100}%`;
           boxElement.style.top = `${(originalBox.y + dy) * 100}%`;
        } else if (editType === "resize") {
           boxElement.style.width = `${Math.max(0.01, originalBox.width + dx) * 100}%`;
           boxElement.style.height = `${Math.max(0.01, originalBox.height + dy) * 100}%`;
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!isEditing || !editId || !startPoint || !originalBox || !imgRef.current) return;

      const p = pointFromEvent(e);
      if (p) {
        const dx = p.x - startPoint.x;
        const dy = p.y - startPoint.y;

        const finalRect = { ...originalBox };
        if (editType === "move") {
           finalRect.x = Math.max(0, Math.min(1 - finalRect.width, originalBox.x + dx));
           finalRect.y = Math.max(0, Math.min(1 - finalRect.height, originalBox.y + dy));
        } else if (editType === "resize") {
           finalRect.width = Math.max(0.01, Math.min(1 - finalRect.x, originalBox.width + dx));
           finalRect.height = Math.max(0.01, Math.min(1 - finalRect.y, originalBox.height + dy));
        }

        // Отправляем финальные координаты для сохранения и пересоздания картинки (OCR запустится заново)
        onDrawComplete(finalRect, imgRef.current, editId);
      }

      setIsEditing(false);
      setEditType(null);
      setEditId(null);
      setStartPoint(null);
      setOriginalBox(null);
    };

    if (isEditing) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isEditing, editId, startPoint, originalBox, editType, onDrawComplete, pointFromEvent]);


  const boxes = draft ? [...textBlocks, { id: "__draft__", ...draft } as TextBlock] : textBlocks

  return (
    <section className="flex min-h-0 w-full flex-col lg:w-3/5">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Image Viewer</h2>
          <p className="text-xs text-slate-500">
            {imageSrc ? "Click and drag over a speech bubble to add a block" : "Upload a manga page to begin"}
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <ImagePlus className="h-4 w-4" />
          {imageSrc ? "Replace image" : "Upload image"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!imageSrc ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-full min-h-[420px] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 text-slate-500 transition-colors hover:border-indigo-500/60 hover:text-slate-300"
          >
            <div className="rounded-full bg-slate-800 p-4">
              <ImagePlus className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium">Drop a manga page or click to browse</p>
            <p className="text-xs text-slate-600">JPG or PNG</p>
          </button>
        ) : (
          <div
            className="relative inline-block w-full select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={finishDraw}
            onMouseLeave={finishDraw}
            style={{ cursor: "crosshair" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              crossOrigin="anonymous"
              src={imageSrc || "/placeholder.svg"}
              alt="Manga page being translated"
              draggable={false}
              className="block w-full rounded-lg border border-slate-800"
            />
            {boxes.map((box, index) => {
              const isDraft = box.id === "__draft__"
              const isSelected = box.id === selectedId
              const hasTranslation = !!box.rusText

              // Режим 1: Профессиональный тайпсеттинг с точной привязкой к масштабу
              if (showTypeset && !isDraft && hasTranslation) {
                const displayText = box.isUppercase ? box.rusText.toUpperCase() : box.rusText
                const currentFont = box.fontFamily || "v_CCFaceFront"

                // Базовый размер шрифта (в условных единицах страницы 1200px)
                const baseSize = box.fontSize || Math.max(11, Math.min(15, Math.round(11 + box.height * 22)))
                // Динамический масштаб под текущий монитор (1080p / 1440p)
                const displayHeight = imgRef.current?.clientHeight || 800
                const currentFontSize = Math.round(baseSize * (displayHeight / 1200))

                return (
                  <div
                    key={box.id}
                    id={`box-${box.id}`}
                    onMouseDown={(e) => {
                      handleBoxMouseDown(e, box as TextBlock, "move")
                    }}
                    className={[
                      "absolute flex flex-col items-center justify-center p-1 text-center select-none transition-all cursor-move",
                      "bg-transparent text-black leading-[1.15]",
                      box.isBold ? "font-bold" : "font-normal",
                      box.isItalic ? "italic" : "not-italic",
                      box.hasStroke ? "manga-text-stroke" : "",
                      isSelected
                        ? "border-2 border-dashed border-amber-400 bg-indigo-500/10 z-20"
                        : "z-10 hover:border hover:border-dashed hover:border-slate-400/50",
                    ].join(" ")}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                      fontFamily: `'${currentFont}', sans-serif`,
                      fontSize: `${currentFontSize}px`,
                    }}
                  >
                    {/* Строго центрированный текст с безопасным переносом слов */}
                    <div
                      className="w-full text-center pointer-events-none"
                      style={{
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        textWrap: "balance",
                      }}
                    >
                      {displayText}
                    </div>

                    {/* Ползунок изменения размера в правом нижнем углу */}
                    {isSelected && (
                      <div
                        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 rounded-full cursor-se-resize shadow-md border border-white z-30"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          handleBoxMouseDown(e, box as TextBlock, "resize")
                        }}
                        title="Потяните, чтобы изменить размер бабла"
                      />
                    )}
                  </div>
                )
              }

              // Режим 2: Обычный режим редактирования рамок
              return (
                <div
                  id={`box-${box.id}`}
                  key={box.id}
                  onMouseDown={(e) => {
                    if (isDraft) return
                    handleBoxMouseDown(e, box as TextBlock, "move")
                  }}
                  className={[
                    "absolute flex items-start justify-start rounded-sm border-2 transition-colors",
                    isDraft
                      ? "border-indigo-400 bg-indigo-400/20"
                      : isSelected
                        ? "border-amber-400 bg-amber-400/20 z-10 cursor-move"
                        : "border-indigo-500/80 bg-indigo-500/10 hover:bg-indigo-500/20 cursor-pointer",
                  ].join(" ")}
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.width * 100}%`,
                    height: `${box.height * 100}%`,
                  }}
                >
                  {!isDraft && (
                    <>
                       <span className="m-0.5 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-bold leading-none text-indigo-300 pointer-events-none">
                         {index + 1}
                       </span>

                       {isSelected && (
                         <div
                           className="absolute -bottom-1 -right-1 w-3 h-3 bg-amber-400 rounded-full cursor-se-resize"
                           onMouseDown={(e) => handleBoxMouseDown(e, box as TextBlock, "resize")}
                         />
                       )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {imageSrc && (
        <footer className="flex items-center gap-2 border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
          <MousePointerSquareDashed className="h-4 w-4" />
          Draw, drag, or resize rectangles to edit speech bubbles.
        </footer>
      )}
    </section>
  )
}
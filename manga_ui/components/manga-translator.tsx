"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { BookText, Layers, Sparkles, Wand2, Loader2, Save, Eye, EyeOff, PlayCircle, Eraser, Zap, Download, FolderOpen, Check } from "lucide-react"
import type { TextBlock, PageItem } from "@/lib/types"
import { ImageViewer } from "@/components/image-viewer"
import { TextBlockCard } from "@/components/text-block-card"
import { Sidebar } from "@/components/sidebar"
import { BatchChapterActions } from "@/components/batch-chapter-actions"
import { runAutoDetect, runPageAutoDetect, getPageImageUrl, getPageBlocks, savePageBlocks, runBatchTranslate, runOcr, runCleanPage, getPageCleanImageUrl, saveTranslatedPage, openTranslatedFolder } from "@/lib/api"

interface DrawRect {
  x: number
  y: number
  width: number
  height: number
}

function cropRegion(img: HTMLImageElement, rect: DrawRect): Promise<{ dataUrl: string; blob: Blob | null }> {
  // Защита: если картинка не загрузилась или повреждена, возвращаем пустой результат без ошибки
  if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
    return Promise.resolve({ dataUrl: "", blob: null })
  }

  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(rect.width * nw))
  canvas.height = Math.max(1, Math.round(rect.height * nh))
  const ctx = canvas.getContext("2d")

  if (ctx) {
    try {
      ctx.drawImage(
        img,
        rect.x * nw,
        rect.y * nh,
        rect.width * nw,
        rect.height * nh,
        0,
        0,
        canvas.width,
        canvas.height
      )
    } catch (err) {
      console.warn("Пропуск нарезки миниатюры (картинка не готова):", err)
      return Promise.resolve({ dataUrl: "", blob: null })
    }
  }

  try {
    const dataUrl = canvas.toDataURL("image/png")
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve({ dataUrl, blob }), "image/png")
    })
  } catch {
    return Promise.resolve({ dataUrl: "", blob: null })
  }
}

export function MangaTranslator() {
  const [currentPage, setCurrentPage] = useState<PageItem | null>(null)
  const [chapterPages, setChapterPages] = useState<PageItem[]>([])
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showTypeset, setShowTypeset] = useState(false) // переключатель режима просмотра перевода
  const [isBatchTranslating, setIsBatchTranslating] = useState(false) // индикатор автоперевода
  const [isCleaning, setIsCleaning] = useState(false)
  const [isFullAuto, setIsFullAuto] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportSuccess, setIsExportSuccess] = useState(false)

  // Реф для доступа к актуальным блокам внутри колбеков
  const textBlocksRef = useRef<TextBlock[]>([])
  textBlocksRef.current = textBlocks
  const currentPageRef = useRef<PageItem | null>(null)
  currentPageRef.current = currentPage

  // Функция сохранения в БД
  const handleSaveBlocks = useCallback(async () => {
    if (!currentPageRef.current) return
    setIsSaving(true)
    try {
      const payload = textBlocksRef.current.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        jap_text: b.japText,
        rus_text: b.rusText,
        status: b.status,
      }))
      await savePageBlocks(currentPageRef.current.id, payload)
    } catch (e) {
      console.error("Ошибка сохранения блоков:", e)
    } finally {
      setIsSaving(false)
    }
  }, [])

  // Хоткей Ctrl + S для сохранения
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handleSaveBlocks()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSaveBlocks])

  // Переключение страницы из сайдбара
  const handleSelectPage = async (page: PageItem) => {
    // Автосохранение предыдущей страницы
    if (currentPageRef.current && textBlocksRef.current.length > 0) {
      await handleSaveBlocks()
    }

    setCurrentPage(page)
    setSelectedId(null)

    // Загружаем картинку
    const url = getPageImageUrl(page.id)
    setImageSrc(url)

    // Загружаем сохраненные блоки из БД
    try {
      const dbBlocks = await getPageBlocks(page.id)

      // Надежная предзагрузка картинки перед нарезкой баблов
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = url

      // Ждем полного декодирования картинки в память
      await new Promise((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve(true)
        } else {
          img.onload = () => resolve(true)
          img.onerror = () => resolve(false)
        }
      })

      const loadedBlocks: TextBlock[] = []
      for (const b of dbBlocks) {
        let cropDataUrl = ""
        let cropBlob: Blob | null = null

        if (img.naturalWidth > 0) {
          const cropped = await cropRegion(img, b)
          cropDataUrl = cropped.dataUrl
          cropBlob = cropped.blob
        }

        loadedBlocks.push({
          id: b.id,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          japText: b.jap_text || "",
          rusText: b.rus_text || "",
          status: b.status as TextBlock["status"],
          imageCrop: cropDataUrl,
          cropBlob: cropBlob,
        })
      }

      setTextBlocks(loadedBlocks)
      // Если страница уже размечалась ранее — показываем сохранённые блоки
      if (loadedBlocks.length > 0) {
        setTextBlocks(loadedBlocks)
        setSelectedId(loadedBlocks[0].id)
      } else {
        // Если страница новая и пустая — АВТОМАТИЧЕСКИ запускаем поиск баблов!
        const autoBoxes = await runPageAutoDetect(page.id)
        if (autoBoxes && autoBoxes.length > 0) {
          const freshBlocks: TextBlock[] = []
          for (const box of autoBoxes) {
            const cropped = await cropRegion(img, box)
            freshBlocks.push({
              id: crypto.randomUUID(),
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              imageCrop: cropped.dataUrl,
              cropBlob: cropped.blob,
              japText: "",
              rusText: "",
              status: "new",
            })
          }
          setTextBlocks(freshBlocks)
          if (freshBlocks.length > 0) setSelectedId(freshBlocks[0].id)
        } else {
          setTextBlocks([])
        }
      }
    } catch (e) {
      console.error("Не удалось загрузить блоки страницы:", e)
      setTextBlocks([])
    }
  }

  // Ручная загрузка через кнопку "Upload image"
  const handleImageLoad = useCallback((src: string) => {
    setCurrentPage(null)
    setImageSrc(src)
    setTextBlocks([])
    setSelectedId(null)
  }, [])

  const handleDrawComplete = useCallback(async (rect: DrawRect, img: HTMLImageElement, existingId?: string) => {
    const { dataUrl, blob } = await cropRegion(img, rect)

    if (existingId) {
      setTextBlocks((prev) =>
        prev.map((b) =>
          b.id === existingId
            ? { ...b, x: rect.x, y: rect.y, width: rect.width, height: rect.height, imageCrop: dataUrl, cropBlob: blob, status: "new" }
            : b
        )
      )
      return
    }

    const id = crypto.randomUUID()
    const block: TextBlock = {
      id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      imageCrop: dataUrl,
      cropBlob: blob,
      japText: "",
      rusText: "",
      status: "new",
    }
    setTextBlocks((prev) => [...prev, block])
    setSelectedId(id)
  }, [])

  const updateBlock = useCallback((id: string, patch: Partial<TextBlock>) => {
    setTextBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }, [])

  const deleteBlock = useCallback((id: string) => {
    setTextBlocks((prev) => prev.filter((b) => b.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  // Ручная смена порядка реплик: меняем местами блоки и переприсваиваем orderIndex
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

  // Удаление по кнопке Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.key === "Delete" && selectedId) {
        deleteBlock(selectedId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedId, deleteBlock])
  // Массовый OCR и связный перевод всех баблов страницы
  const handleTranslateAll = async () => {
    if (textBlocks.length === 0) return
    setIsBatchTranslating(true)

    try {
      // 1. Для всех блоков, где ещё нет японского текста, запускаем MangaOCR
      const currentBlocks = [...textBlocks]
      for (let i = 0; i < currentBlocks.length; i++) {
        const b = currentBlocks[i]
        if (!b.japText && b.cropBlob) {
          const ocrText = await runOcr(b.cropBlob)
          currentBlocks[i] = { ...b, japText: ocrText, status: "ocr-done" }
        }
      }
      setTextBlocks([...currentBlocks])

      // 2. Отбираем блоки для перевода (где есть японский текст)
      const toTranslate = currentBlocks
        .filter((b) => b.japText.trim().length > 0)
        .map((b) => ({ id: b.id, text: b.japText }))

      if (toTranslate.length === 0) {
        setIsBatchTranslating(false)
        return
      }

      // 3. Отправляем в Gemini одним пакетом
      const translations = await runBatchTranslate(toTranslate)

      // 4. Записываем русский перевод в карточки
      const updated = currentBlocks.map((b) => {
        if (translations[b.id]) {
          return { ...b, rusText: translations[b.id], status: "translated" as const }
        }
        return b
      })

      setTextBlocks(updated)
      setShowTypeset(true) // сразу включаем режим предпросмотра результата
    } catch (e) {
      console.error(e)
      alert("Ошибка при массовом переводе")
    } finally {
      setIsBatchTranslating(false)
    }
  }

  // Запекает русский текст на чистый скан в 100% оригинальном разрешении и сохраняет на диск
  const handleExportPage = async (overrideImgSrc?: string, overrideBlocks?: TextBlock[]) => {
    const targetSrc = overrideImgSrc || imageSrc
    // Используем переданные свежие блоки или актуальный стейт
    const blocksToExport = overrideBlocks || textBlocksRef.current || textBlocks

    if (!currentPage || !targetSrc) return
    setIsExporting(true)

    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = targetSrc

      await new Promise((res) => {
        if (img.complete && img.naturalWidth > 0) res(true)
        else {
          img.onload = () => res(true)
          img.onerror = () => res(false)
        }
      })

      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Не удалось создать контекст холста")

      // 1. Рисуем очищенную страницу
      ctx.drawImage(img, 0, 0)

      // 2. Рисуем баблы из актуального списка
      for (const box of blocksToExport) {
        if (!box.rusText.trim()) continue

        const bx = box.x * canvas.width
        const by = box.y * canvas.height
        const bw = box.width * canvas.width
        const bh = box.height * canvas.height

        const displayText = box.isUppercase ? box.rusText.toUpperCase() : box.rusText
        const fontName = box.fontFamily || "v_CCFaceFront"
        const isBold = box.isBold ? "bold " : ""
        const isItalic = box.isItalic ? "italic " : ""

        // Точная формула масштаба: 1 в 1 как на экране
        const baseSize = box.fontSize || Math.max(11, Math.min(15, Math.round(11 + box.height * 22)))
        const calculatedSize = Math.round(baseSize * (canvas.height / 1200))

        ctx.font = `${isItalic}${isBold}${calculatedSize}px '${fontName}', sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        // Безопасный перенос: слова длиннее ширины бабла аккуратно делятся
        const maxWidth = bw * 0.88
        const words = displayText.split(/\s+/)
        const lines: string[] = []
        let currentLine = ""

        for (const w of words) {
          // Если само слово длиннее бабла — делим его на части
          if (ctx.measureText(w).width > maxWidth) {
            if (currentLine) {
              lines.push(currentLine)
              currentLine = ""
            }
            let part = ""
            for (const char of w) {
              if (ctx.measureText(part + char).width > maxWidth) {
                lines.push(part)
                part = char
              } else {
                part += char
              }
            }
            currentLine = part
            continue
          }

          const testLine = currentLine ? `${currentLine} ${w}` : w
          if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = w
          } else {
            currentLine = testLine
          }
        }
        if (currentLine) lines.push(currentLine)

        const lineHeight = calculatedSize * 1.16
        const startY = by + bh / 2 - ((lines.length - 1) * lineHeight) / 2
        const centerX = bx + bw / 2

        lines.forEach((line, idx) => {
          const ly = startY + idx * lineHeight

          // Белая обводка (Stroke)
          if (box.hasStroke) {
            ctx.strokeStyle = "#FFFFFF"
            ctx.lineWidth = Math.max(4, calculatedSize * 0.22)
            ctx.lineJoin = "round"
            ctx.strokeText(line, centerX, ly)
          }

          // Черный текст строго по центру
          ctx.fillStyle = "#000000"
          ctx.fillText(line, centerX, ly)
        })
      }

      // 3. Отправляем в translated/
      await new Promise<void>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            await saveTranslatedPage(currentPage.id, blob)
            setIsExportSuccess(true)
            setTimeout(() => setIsExportSuccess(false), 2500)
          }
          resolve()
        }, "image/png")
      })

    } catch (e) {
      console.error("Ошибка экспорта:", e)
    } finally {
      setIsExporting(false)
    }
  }

  // Мастер-кнопка: запускает весь цикл (Детект -> Перевод -> Клин -> Тайпсет) в 1 клик
  const handleFullAuto = async () => {
    if (!currentPage && !imageSrc) return
    setIsFullAuto(true)

    try {
      // 1. Если баблов еще нет — сначала детектим
      let currentBlocks = [...textBlocks]
      if (currentBlocks.length === 0) {
        await handleAutoDetect()
        currentBlocks = textBlocksRef.current
      }

      if (currentBlocks.length === 0) {
        alert("Баблы не обнаружены.")
        setIsFullAuto(false)
        return
      }

      // 2. Распознаем японский (OCR) для всех баблов
      for (let i = 0; i < currentBlocks.length; i++) {
        const b = currentBlocks[i]
        if (!b.japText && b.cropBlob) {
          const ocrText = await runOcr(b.cropBlob)
          currentBlocks[i] = { ...b, japText: ocrText, status: "ocr-done" }
        }
      }

      // 3. Переводим через Gemini
      const toTranslate = currentBlocks
        .filter((b) => b.japText.trim().length > 0)
        .map((b) => ({ id: b.id, text: b.japText }))

      if (toTranslate.length > 0) {
        const translations = await runBatchTranslate(toTranslate)
        currentBlocks = currentBlocks.map((b) => {
          if (translations[b.id]) {
            return { ...b, rusText: translations[b.id], status: "translated" as const }
          }
          return b
        })
      }
      setTextBlocks([...currentBlocks])
      textBlocksRef.current = currentBlocks

      // 4. Очищаем баблы через OpenCV (Клин)
      if (currentPage) {
        const payload = currentBlocks.map((b) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          jap_text: b.japText,
          rus_text: b.rusText,
          status: b.status,
        }))
        await savePageBlocks(currentPage.id, payload)

        const cleanRes = await runCleanPage(currentPage.id)
        if (cleanRes.success) {
          const cleanUrl = `${getPageCleanImageUrl(currentPage.id)}?t=${Date.now()}`
          setImageSrc(cleanUrl)
          setShowTypeset(true)

          // 5. Сразу запекаем чистую картинку ВМЕСТЕ с переведенным русским текстом
          await handleExportPage(cleanUrl, currentBlocks)
        } else {
          setShowTypeset(true)
        }
      } else {
        setShowTypeset(true)
      }
    } catch (e) {
      console.error(e)
      alert("Ошибка при автоматической обработке")
    } finally {
      setIsFullAuto(false)
    }
  }

  // Очистка всех баблов на странице от японского текста (Клин)
  const handleCleanPage = async () => {
    if (!currentPage) {
      alert("Клин доступен для страниц из открытого проекта.")
      return
    }
    if (textBlocks.length === 0) {
      alert("Сначала запустите Auto-Detect, чтобы найти баблы.")
      return
    }

    setIsCleaning(true)
    try {
      // 1. Сначала сохраняем координаты баблов в БД
      await handleSaveBlocks()

      // 2. Запускаем серверный клин (OpenCV стирает иероглифы)
      const res = await runCleanPage(currentPage.id)
      if (res.success) {
        // 3. Подменяем картинку в просмотрщике на очищенную (с таймштампом для сброса кеша)
        setImageSrc(`${getPageCleanImageUrl(currentPage.id)}?t=${Date.now()}`)
        setShowTypeset(true) // Включаем режим показа перевода
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

  const handleAutoDetect = async () => {
    if (!imageSrc) return
    setIsDetecting(true)

    try {
      let boxes: Array<{ x: number; y: number; width: number; height: number }> = []

      // 1. Если выбрана страница из БД — сервер читает её напрямую с диска (мгновенно!)
      if (currentPage) {
        boxes = await runPageAutoDetect(currentPage.id)
      } else {
        // 2. Иначе (одиночный загруженный файл) — шлём как Blob
        const response = await fetch(imageSrc)
        const pageBlob = await response.blob()
        boxes = await runAutoDetect(pageBlob)
      }

      if (!boxes || boxes.length === 0) {
        alert("Баблы не найдены!")
        setIsDetecting(false)
        return
      }

      // Создаем объект Image с CORS для нарезки миниатюр
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = imageSrc
      await new Promise((resolve) => {
        img.onload = resolve
        img.onerror = resolve
      })

      const newBlocks: TextBlock[] = []
      for (const box of boxes) {
        const { dataUrl, blob } = await cropRegion(img, box)
        newBlocks.push({
          id: crypto.randomUUID(),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          imageCrop: dataUrl,
          cropBlob: blob,
          japText: "",
          rusText: "",
          status: "new",
        })
      }

      setTextBlocks(newBlocks)
      if (newBlocks.length > 0) setSelectedId(newBlocks[0].id)
    } catch (e) {
      console.error(e)
      alert("Ошибка при авто-детекции")
    } finally {
      setIsDetecting(false)
    }
  }

  const translatedCount = textBlocks.filter((b) => b.status === "translated").length

  // Автодополнение имён персонажей из уже заполненных реплик страницы
  const speakerSuggestions = Array.from(
    new Set(textBlocks.map((b) => b.speaker?.trim()).filter((s): s is string => !!s)),
  )

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      {/* Список известных персонажей для быстрого выбора говорящего */}
      <datalist id="manga-speakers">
        {speakerSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {/* Шапка */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
            <BookText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-white">Manga Translator</h1>
            <p className="text-xs text-slate-500">
              {currentPage ? `Page ${currentPage.page_number}` : "Standalone Mode"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {currentPage && (
            <>
              {/* Кнопка 1: Открыть готовую папку в проводнике Windows */}
              <button
                onClick={() => openTranslatedFolder(currentPage.id)}
                className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                title="Открыть папку с готовыми страницами в Проводнике"
              >
                <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
                Folder
              </button>

              {/* Кнопка 2: Запечь и сохранить готовую страницу */}
              <button
                onClick={() => handleExportPage()}
                disabled={isExporting || textBlocks.length === 0}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-all shadow-sm",
                  isExportSuccess
                    ? "bg-emerald-500 ring-2 ring-emerald-300"
                    : "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                ].join(" ")}
                title="Запечь перевод в исходном качестве и сохранить в папку 'translated'"
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isExportSuccess ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {isExportSuccess ? "Saved to folder!" : "Export Page"}
              </button>

              {/* Кнопка 3: Сохранить проект в БД */}
              <button
                onClick={handleSaveBlocks}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                title="Save to database (Ctrl+S)"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </>
          )}

          <span className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-slate-500" />
            {textBlocks.length} blocks
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            {translatedCount} translated
          </span>
        </div>
      </header>

      {/* Панель пакетных действий для всей главы */}
      <BatchChapterActions
        pages={chapterPages}
        currentPageId={currentPage?.id ?? null}
        onRefreshCurrent={() => {
          if (currentPageRef.current) handleSelectPage(currentPageRef.current)
        }}
      />

      {/* Основная рабочая область: Сайдбар + Просмотрщик + Панель перевода */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Левый сайдбар проекта */}
        <Sidebar
          currentPageId={currentPage?.id || null}
          onSelectPage={handleSelectPage}
          onActiveChapterChange={setChapterPages}
        />

        {/* Просмотрщик страницы */}
        <ImageViewer
          imageSrc={imageSrc}
          textBlocks={textBlocks}
          selectedId={selectedId}
          showTypeset={showTypeset}
          onSelect={setSelectedId}
          onImageLoad={handleImageLoad}
          onDrawComplete={handleDrawComplete}
        />

        {/* Правая панель с карточками */}
        <section className="flex min-h-0 w-full flex-col border-t border-slate-800 lg:w-2/5 lg:border-l lg:border-t-0">
          <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Translation Panel</h2>
              <p className="text-xs text-slate-500">Detected text blocks</p>
            </div>

            <div className="flex items-center gap-2">
              {/* Кнопка 0: ВСЁ В 1 КЛИК (FULL AUTO PIPELINE) */}
              <button
                onClick={handleFullAuto}
                disabled={isFullAuto || isDetecting || isBatchTranslating || isCleaning}
                className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-amber-500 to-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-50"
                title="Выполнить весь цикл: Детект -> Перевод -> Клин -> Тайпсет"
              >
                {isFullAuto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 fill-current" />}
                Full Auto
              </button>

              <div className="h-4 w-[1px] bg-slate-800" />

              {/* Кнопка 1: ДЕТЕКТ БАБЛОВ */}
              <button
                onClick={handleAutoDetect}
                disabled={!imageSrc || isDetecting || isFullAuto}
                className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
                title="Шаг 1: Найти речевые баблы (YOLO)"
              >
                {isDetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-indigo-400" />}
                1. Detect
              </button>

              {/* Кнопка 2: ПЕРЕВОД (OCR + GEMINI) */}
              <button
                onClick={handleTranslateAll}
                disabled={textBlocks.length === 0 || isBatchTranslating || isFullAuto}
                className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
                title="Шаг 2: Распознать японский и перевести всю страницу"
              >
                {isBatchTranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 text-emerald-400" />}
                2. Translate
              </button>

              {/* Кнопка 3: КЛИН (ОЧИСТКА БАБЛОВ) */}
              <button
                onClick={handleCleanPage}
                disabled={!currentPage || textBlocks.length === 0 || isCleaning || isFullAuto}
                className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
                title="Шаг 3: Стереть японский текст внутри баблов (OpenCV)"
              >
                {isCleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5 text-sky-400" />}
                3. Clean
              </button>

              {/* Кнопка 4: РЕЖИМ ТАЙПСЕТА */}
              <button
                onClick={() => setShowTypeset((prev) => !prev)}
                className={[
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors border",
                  showTypeset
                    ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                ].join(" ")}
                title="Шаг 4: Переключить режим отображения перевода"
              >
                {showTypeset ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {showTypeset ? "Typeset ON" : "Typeset OFF"}
              </button>

              <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-medium text-slate-400">
                {textBlocks.length}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {textBlocks.length === 0 ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center text-slate-600">
                <Layers className="h-8 w-8" />
                <p className="text-sm font-medium text-slate-500">No text blocks yet</p>
                <p className="max-w-[220px] text-xs">
                  Select a page from explorer or drag a rectangle over a speech bubble.
                </p>
              </div>
            ) : (
              textBlocks.map((block, index) => (
                <TextBlockCard
                  key={block.id}
                  block={block}
                  index={index}
                  isSelected={block.id === selectedId}
                  onSelect={() => setSelectedId(block.id)}
                  onChange={(patch) => updateBlock(block.id, patch)}
                  onDelete={() => deleteBlock(block.id)}
                  onMoveUp={() => moveBlock(block.id, "up")}
                  onMoveDown={() => moveBlock(block.id, "down")}
                  canMoveUp={index > 0}
                  canMoveDown={index < textBlocks.length - 1}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

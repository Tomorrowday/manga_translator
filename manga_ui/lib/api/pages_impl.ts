// manga_ui/lib/api/pages_impl.ts
// Реализация API запросов для страниц, баблов и взаимодействия с бэкендом

import type { PageItem } from "../types"
import { API_BASE_URL, handleApiResponse } from "./client"

export function getPageImageUrl(pageId: number): string {
  return `${API_BASE_URL}/api/pages/${pageId}/image`
}

export function getPageCleanImageUrl(pageId: number): string {
  return `${API_BASE_URL}/api/pages/${pageId}/clean-image`
}

export async function releaseVram() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pages/release-vram`, {
      method: "POST",
    })
    return await handleApiResponse<any>(res, "Ошибка очистки VRAM")
  } catch (error) {
    console.warn("Не удалось очистить VRAM:", error)
  }
}

export async function getPageDetails(pageId: number): Promise<PageItem | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}`)
    const data = await res.json()
    return data.success ? data.page : null
  } catch {
    return null
  }
}

export async function getPageSpeakers(pageId: number): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/speakers`)
    const data = await res.json()
    return data.speakers || []
  } catch {
    return []
  }
}

export async function runPageAutoDetect(pageId: number, conf?: number, autoOval?: boolean) {
  try {
    const params = new URLSearchParams()
    if (conf !== undefined) params.append("conf", String(conf))
    if (autoOval !== undefined) params.append("auto_oval", String(autoOval))
    const query = params.toString() ? `?${params.toString()}` : ""

    const response = await fetch(`${API_BASE_URL}/api/pages/${pageId}/detect${query}`, {
      method: "POST",
    })
    return await handleApiResponse<any>(response, "Ошибка сервера детекции")
  } catch (error) {
    console.error("Page Detect failed:", error)
    return { success: false, boxes: [] }
  }
}

export async function getPageBlocks(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/blocks`)
  const data = await handleApiResponse<any>(res, "Ошибка получения баблов")
  if (!data.success) throw new Error(data.error)
  return data.blocks
}

export async function savePageBlocks(
  pageId: number,
  blocks: Array<{
    id: string
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    jap_text: string
    rus_text: string
    speaker?: string
    order_index?: number
    font_size?: number
    font_family?: string
    is_bold?: boolean
    is_italic?: boolean
    is_uppercase?: boolean
    has_stroke?: boolean
    text_color?: string
    shape?: string
    padding_mode?: string
    min_hyphens?: boolean
    status: string
  }>
) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  })
  return await handleApiResponse<any>(res, "Ошибка сохранения баблов")
}

export async function runCleanPage(pageId: number, mode: "auto" | "lama" | "white" = "auto") {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean?mode=${mode}`, {
    method: "POST",
  })
  return await handleApiResponse<any>(res, "Ошибка клина страницы")
}

export async function revertCleanPage(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean`, {
    method: "DELETE",
  })
  return await handleApiResponse<any>(res, "Ошибка отката клина")
}

export async function runSpotClean(
  pageId: number,
  rect: { x: number; y: number; width: number; height: number; rotation?: number; shape?: string },
  method: "auto" | "lama" | "white" | "lama_box" = "auto"
) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean-spot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotation: rect.rotation || 0.0,
      shape: rect.shape || "rect",
      method,
    }),
  })
  return await handleApiResponse<any>(res, "Ошибка точечного клина")
}

export async function saveTranslatedPage(pageId: number, imageBlob: Blob) {
  const formData = new FormData()
  formData.append("file", imageBlob, "translated.png")

  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/save-translated`, {
    method: "POST",
    body: formData,
  })
  return await handleApiResponse<any>(res, "Ошибка запекания страницы")
}

export async function openTranslatedFolder(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/open-folder`, {
    method: "POST",
  })
  return await handleApiResponse<any>(res, "Не удалось открыть папку")
}

export async function runBrushClean(
  pageId: number,
  maskBase64: string,
  mode: "lama" | "white" | "black" = "lama"
) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean-brush`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mask_base64: maskBase64,
      mode,
    }),
  })
  return await handleApiResponse<any>(res, "Ошибка кисти восстановления")
}
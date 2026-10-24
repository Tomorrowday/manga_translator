// manga_ui/lib/api/ai_impl.ts
// Реализация выполнения сетевых запросов MangaOCR и Gemini API

import { API_BASE_URL, handleApiResponse } from "./client"

export async function runOcr(
  pageId: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number = 0
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageId, x, y, width, height, rotation }),
    })
    const data = await handleApiResponse<{ success: boolean; text?: string; error?: string }>(
      response,
      "Ошибка сервера OCR"
    )
    if (data.success && data.text !== undefined) return data.text
    throw new Error(data.error || "Неизвестная ошибка OCR")
  } catch (error) {
    console.error("OCR Request failed:", error)
    return "❌ Ошибка"
  }
}

export async function runTranslate(
  japText: string,
  context: string = "",
  glossary: Record<string, string> = {},
  titleDescription: string = ""
): Promise<string> {
  if (!japText.trim()) return ""

  try {
    const response = await fetch(`${API_BASE_URL}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: japText,
        context,
        glossary,
        title_description: titleDescription,
      }),
    })
    const data = await handleApiResponse<{ success: boolean; translated?: string; error?: string }>(
      response,
      "Ошибка сервера перевода"
    )
    if (data.success && data.translated !== undefined) return data.translated
    throw new Error(data.error || "Неизвестная ошибка перевода")
  } catch (error) {
    console.error("Translation Request failed:", error)
    return "❌ Ошибка перевода"
  }
}

export async function runBatchTranslate(
  items: Array<{ id: string; text: string; speaker?: string; order_index?: number }>,
  pageId?: number
): Promise<Record<string, string>> {
  if (items.length === 0) return {}

  try {
    const response = await fetch(`${API_BASE_URL}/api/translate/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, page_id: pageId }),
    })
    const data = await handleApiResponse<{ success: boolean; translations?: Record<string, string>; error?: string }>(
      response,
      "Ошибка пакетного перевода"
    )
    if (data.success && data.translations) return data.translations
    throw new Error(data.error || "Ошибка пакетного перевода")
  } catch (error) {
    console.error("Batch translate failed:", error)
    return {}
  }
}
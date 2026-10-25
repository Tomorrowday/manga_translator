// manga_ui/lib/api/chapters_impl.ts
// Реализация запросов операций с главами, скриптами диалогов и таймером

import { API_BASE_URL, handleApiResponse } from "./client"

export async function runTranslateChapter(chapterId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/translate`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка перевода главы")
}

export async function deleteChapter(chapterId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}`, {
    method: "DELETE",
  })
  return handleApiResponse(res, "Ошибка удаления главы")
}

export async function resetChapterBubbleFonts(chapterId: number): Promise<{ success: boolean; updated_count: number }> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/reset-fonts`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка сброса шрифтов главы")
}

export async function applyChapterFontSize(
  chapterId: number,
  fontSize: number
): Promise<{ success: boolean; updated_count: number }> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/apply-font-size?font_size=${fontSize}`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка применения шрифта ко всей главе")
}

export async function exportChapterScriptToFolder(chapterId: number): Promise<{
  success: boolean
  message: string
  saved_path: string
}> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/export-dialogue-to-folder`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка сохранения скриптов в папку")
}

export async function uploadChapterScript(
  chapterId: number,
  file: File
): Promise<{
  success: boolean
  message: string
  updated_count: number
  total_records: number
}> {
  const formData = new FormData()
  formData.append("file", file)

  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/import-dialogue`, {
    method: "POST",
    body: formData,
  })
  return handleApiResponse(res, "Ошибка загрузки файла перевода")
}

export async function pickAndImportChapterScript(chapterId: number): Promise<{
  success: boolean
  message: string
  file_used?: string
  updated_count: number
  total_records: number
}> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/pick-and-import-dialogue`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка автоматического поиска файла перевода")
}

// ---- Таймер и пересчет статистики главы ----

export async function getChapterTimerStatus(chapterId: number): Promise<{
  success: boolean
  chapter_id: number
  is_running: boolean
  work_seconds: number
  current_session_seconds: number
  total_seconds: number
}> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/timer/status`)
  return handleApiResponse(res, "Ошибка получения статуса таймера")
}

export async function startChapterTimer(chapterId: number): Promise<{
  success: boolean
  is_running: boolean
  work_seconds: number
  total_seconds: number
}> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/timer/start`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка запуска таймера")
}

export async function stopChapterTimer(chapterId: number): Promise<{
  success: boolean
  is_running: boolean
  work_seconds: number
  total_seconds: number
}> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/timer/stop`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка остановки таймера")
}

export async function recalculateChapterStats(chapterId: number): Promise<{
  success: boolean
  chapter_id: number
  replicas_count: number
  words_count: number
}> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/recalculate-stats`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка пересчёта статистики главы")
}
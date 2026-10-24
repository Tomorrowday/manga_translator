// manga_ui/lib/api/chapters_impl.ts
// Реализация запросов управления главами, сброса шрифтов и работы с JSON диалогов

import { API_BASE_URL, handleApiResponse } from "./client"

export async function runTranslateChapter(chapterId: number) {
  const response = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/translate-all`, {
    method: "POST",
  })
  return await handleApiResponse<any>(response, "Ошибка перевода главы")
}

export async function deleteChapter(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}`, {
    method: "DELETE",
  })
  return await handleApiResponse<any>(res, "Ошибка удаления главы")
}

export async function resetChapterBubbleFonts(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/reset-fonts`, {
    method: "POST",
  })
  return await handleApiResponse<any>(res, "Ошибка сброса шрифтов главы")
}

export async function exportChapterScriptToFolder(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/export-dialogue-to-folder`, {
    method: "POST",
  })
  return await handleApiResponse<any>(res, "Ошибка сохранения скрипта в папку главы")
}

export async function uploadChapterScript(chapterId: number, file: File) {
  const formData = new FormData()
  formData.append("file", file)

  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/import-dialogue`, {
    method: "POST",
    body: formData,
  })
  return await handleApiResponse<any>(res, "Ошибка импорта диалогов")
}

export async function pickAndImportChapterScript(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/pick-and-import-dialogue`, {
    method: "POST",
  })
  return await handleApiResponse<any>(res, "Ошибка выбора и импорта JSON скрипта")
}
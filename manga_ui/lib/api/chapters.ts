// lib/api/chapters.ts
// Операции с главами, пакетный перевод и экспорт/импорт JSON скриптов

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

export async function downloadChapterScript(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/export-dialogue`)
  if (!res.ok) throw new Error("Не удалось экспортировать диалоги")
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `chapter_${chapterId}_dialogue.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
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

export async function importChapterScriptFromFolder(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/import-dialogue-from-folder`, {
    method: "POST",
  })
  return await handleApiResponse<any>(res, "Ошибка авто-импорта JSON из папки главы")
}
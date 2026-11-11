// manga_ui/lib/api/projects_impl.ts
// Реализация API-запросов проектов, глобальных настроек, глоссария и детальной статистики

import { API_BASE_URL, handleApiResponse } from "./client"
import type { TitleProject, ProjectTree, GlossaryItem, TitleSettings } from "../types"

export async function getGlobalSettings(): Promise<{ success: boolean; settings: TitleSettings }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/global-settings`)
  return handleApiResponse(res, "Ошибка получения глобальных настроек")
}

export async function updateGlobalSettings(settings: Partial<TitleSettings>): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/global-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  })
  return handleApiResponse(res, "Ошибка сохранения глобальных настроек")
}

export async function getProjects(): Promise<TitleProject[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects`)
  const data = await handleApiResponse<any>(res, "Ошибка получения списка проектов")
  if (Array.isArray(data)) {
    return data
  }
  return data?.projects || []
}

export async function scanProjectFolder(name: string, folder_path: string): Promise<{ success: boolean; message: string; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder_path }),
  })
  return handleApiResponse(res, "Ошибка сканирования папки")
}

export async function rescanProject(titleId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/rescan`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка повторного сканирования проекта")
}

export async function addChapterToProject(
  titleId: number,
  folder_path: string,
  chapter_number?: string
): Promise<{ success: boolean; message: string; error?: string; detail?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path, chapter_number }),
  })
  return handleApiResponse(res, "Ошибка добавления главы")
}

export async function getProjectTree(titleId: number): Promise<ProjectTree> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/tree`)
  const data = await handleApiResponse<{ success: boolean; title: ProjectTree }>(res, "Ошибка дерева проекта")
  return data.title
}

export async function getAvailableDetectors(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE_URL}/api/projects/detectors`)
  const data = await handleApiResponse<{ success: boolean; detectors: Record<string, string> }>(res, "Ошибка моделей детекции")
  return data.detectors
}

export async function getAvailableCleaners(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE_URL}/api/projects/cleaners`)
  const data = await handleApiResponse<{ success: boolean; cleaners: Record<string, string> }>(res, "Ошибка моделей клина")
  return data.cleaners
}

export async function updateTitleSettings(
  titleId: number,
  settings: Partial<TitleSettings>
): Promise<{ success: boolean; description: string; default_font_size: number }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  })
  return handleApiResponse(res, "Ошибка обновления настроек тайтла")
}

export async function getTitleSpeakers(titleId: number, chapterId?: number): Promise<string[]> {
  const url = chapterId
    ? `${API_BASE_URL}/api/projects/${titleId}/speakers?chapter_id=${chapterId}`
    : `${API_BASE_URL}/api/projects/${titleId}/speakers`
  const res = await fetch(url)
  const data = await handleApiResponse<{ success: boolean; speakers: string[] }>(res, "Ошибка загрузки персонажей")
  return data.speakers || []
}

export async function deleteProject(titleId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}`, {
    method: "DELETE",
  })
  return handleApiResponse(res, "Ошибка удаления проекта")
}

export async function getGlossary(titleId: number): Promise<GlossaryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary`)
  const data = await handleApiResponse<{ success: boolean; items: GlossaryItem[] }>(res, "Ошибка загрузки глоссария")
  return data.items || []
}

export async function addGlossaryItem(
  titleId: number,
  item: { jap_word?: string; rus_word: string; context?: string }
): Promise<GlossaryItem> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  })
  const data = await handleApiResponse<{ success: boolean; item: GlossaryItem }>(res, "Ошибка добавления в глоссарий")
  return data.item
}

export async function deleteGlossaryItem(titleId: number, entryId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary/${entryId}`, {
    method: "DELETE",
  })
  await handleApiResponse(res, "Ошибка удаления из глоссария")
}

// ---- Детальная статистика по всем тайтлам и главам ----

export interface ChapterDetailedItem {
  id: number
  chapter_number: string
  pages_count: number
  replicas_count: number | null
  words_count: number | null
  work_seconds: number
  is_timer_running: boolean
}

export interface TitleDetailedItem {
  id: number
  name: string
  total_pages: number
  total_replicas: number
  total_words: number
  total_seconds: number
  chapters: ChapterDetailedItem[]
}

export async function getAllDetailedStats(): Promise<{ success: boolean; projects: TitleDetailedItem[] }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/all-detailed-stats`)
  return handleApiResponse(res, "Ошибка загрузки детальной статистики")
}

export async function recalculateTitleStats(titleId: number): Promise<{
  success: boolean
  title_id: number
  chapters_recalculated: number
  total_replicas: number
  total_words: number
}> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/recalculate-all`, {
    method: "POST",
  })
  return handleApiResponse(res, "Ошибка пересчёта статистики тайтла")
}
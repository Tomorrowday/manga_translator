// lib/api/projects.ts
// Управление проектами (тайтлами), глоссарием и статистикой БД

import type { GlossaryItem, ProjectStats, TitleProject, ProjectTree } from "../types"
import { API_BASE_URL, handleApiResponse } from "./client"

export async function getProjects(): Promise<TitleProject[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects`)
  const data = await handleApiResponse<{ projects: TitleProject[] }>(res, "Ошибка загрузки тайтлов")
  return data.projects || []
}

export async function scanProjectFolder(name: string, folderPath: string) {
  const res = await fetch(`${API_BASE_URL}/api/projects/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder_path: folderPath }),
  })
  return await handleApiResponse<any>(res, "Ошибка сканирования папки")
}

export async function addChapterToProject(titleId: number, folderPath: string, chapterNumber?: string) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath, chapter_number: chapterNumber }),
  })
  return await handleApiResponse<any>(res, "Ошибка добавления главы")
}

export async function getProjectTree(titleId: number): Promise<ProjectTree> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/tree`)
  const data = await handleApiResponse<{ success: boolean; title: ProjectTree; error?: string }>(
    res,
    "Ошибка загрузки дерева проекта"
  )
  if (!data.success) throw new Error(data.error)
  return data.title
}

export async function updateTitleDescription(titleId: number, description: string) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/description`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  })
  return await handleApiResponse<any>(res, "Ошибка обновления синопсиса")
}

export async function getTitleSpeakers(titleId: number, chapterId?: number): Promise<string[]> {
  const query = chapterId ? `?chapter_id=${chapterId}` : ""
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/speakers${query}`)
  const data = await handleApiResponse<{ speakers: string[] }>(res, "Ошибка загрузки спикеров")
  return data.speakers || []
}

export async function deleteProject(titleId: number) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}`, {
    method: "DELETE",
  })
  return await handleApiResponse<any>(res, "Ошибка удаления тайтла")
}

export async function getGlossary(titleId: number): Promise<GlossaryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary`)
  const data = await handleApiResponse<{ items: GlossaryItem[] }>(res, "Ошибка загрузки глоссария")
  return data.items || []
}

export async function addGlossaryItem(
  titleId: number,
  item: { jap_word?: string; rus_word: string; context?: string }
): Promise<GlossaryItem | null> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  })
  const data = await handleApiResponse<{ item?: GlossaryItem }>(res, "Ошибка добавления термина")
  return data.item || null
}

export async function deleteGlossaryItem(titleId: number, entryId: number) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary/${entryId}`, {
    method: "DELETE",
  })
  return await handleApiResponse<any>(res, "Ошибка удаления термина")
}

export async function getProjectStats(titleId: number): Promise<ProjectStats | null> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/stats`)
  const data = await handleApiResponse<{ stats: ProjectStats }>(res, "Ошибка загрузки статистики")
  return data.stats || null
}
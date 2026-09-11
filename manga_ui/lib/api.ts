// lib/api.ts

import type { GlossaryItem, ProjectStats, PageItem } from "./types"

const API_BASE_URL = "http://127.0.0.1:8000";

export async function getPageDetails(pageId: number): Promise<PageItem | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}`);
    const data = await res.json();
    return data.success ? data.page : null;
  } catch {
    return null;
  }
}

export async function getPageSpeakers(pageId: number): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/speakers`);
    const data = await res.json();
    return data.speakers || [];
  } catch {
    return [];
  }
}

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
    });
    if (!response.ok) throw new Error(`Ошибка сервера OCR: ${response.statusText}`);
    const data = await response.json();
    if (data.success) return data.text;
    throw new Error(data.error || "Неизвестная ошибка OCR");
  } catch (error) {
    console.error("OCR Request failed:", error);
    return "❌ Ошибка";
  }
}

export async function runTranslate(
  japText: string,
  context: string = "",
  glossary: Record<string, string> = {},
  titleDescription: string = ""
): Promise<string> {
  if (!japText.trim()) return "";

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
    });
    if (!response.ok) throw new Error(`Ошибка сервера перевода: ${response.statusText}`);
    const data = await response.json();
    if (data.success) return data.translated;
    throw new Error(data.error || "Неизвестная ошибка перевода");
  } catch (error) {
    console.error("Translation Request failed:", error);
    return "❌ Ошибка перевода";
  }
}

export async function runBatchTranslate(
  items: Array<{ id: string; text: string; speaker?: string; order_index?: number }>,
  pageId?: number
): Promise<Record<string, string>> {
  if (items.length === 0) return {};

  try {
    const response = await fetch(`${API_BASE_URL}/api/translate/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, page_id: pageId }),
    });
    if (!response.ok) throw new Error("Ошибка пакетного перевода");
    const data = await response.json();
    if (data.success) return data.translations;
    throw new Error(data.error);
  } catch (error) {
    console.error("Batch translate failed:", error);
    return {};
  }
}

export function getPageImageUrl(pageId: number): string {
  return `${API_BASE_URL}/api/pages/${pageId}/image`;
}

export function getPageCleanImageUrl(pageId: number): string {
  return `${API_BASE_URL}/api/pages/${pageId}/clean-image`;
}

export async function runPageAutoDetect(pageId: number) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pages/${pageId}/detect`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Ошибка сервера детекции");
    return await response.json();
  } catch (error) {
    console.error("Page Detect failed:", error);
    return { success: false, boxes: [] };
  }
}

export async function getPageBlocks(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/blocks`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.blocks;
}

export async function savePageBlocks(
  pageId: number,
  blocks: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    jap_text: string;
    rus_text: string;
    speaker?: string;
    order_index?: number;
    font_size?: number;
    font_family?: string;
    is_bold?: boolean;
    is_italic?: boolean;
    is_uppercase?: boolean;
    has_stroke?: boolean;
    shape?: string;
    padding_mode?: string;
    status: string;
  }>
) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
  return await res.json();
}

export async function runCleanPage(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean`, {
    method: "POST",
  });
  return await res.json();
}

export async function revertCleanPage(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean`, {
    method: "DELETE",
  });
  return await res.json();
}

export async function runSpotClean(
  pageId: number,
  rect: { x: number; y: number; width: number; height: number },
  method: "auto" | "lama" | "white" = "auto"
) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean-spot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      method,
    }),
  });
  return await res.json();
}

export async function saveTranslatedPage(pageId: number, imageBlob: Blob) {
  const formData = new FormData();
  formData.append("file", imageBlob, "translated.png");

  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/save-translated`, {
    method: "POST",
    body: formData,
  });
  return await res.json();
}

export async function openTranslatedFolder(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/open-folder`, {
    method: "POST",
  });
  return await res.json();
}

export async function runTranslateChapter(chapterId: number) {
  const response = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/translate-all`, {
    method: "POST",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.error || "Ошибка перевода главы");
  }
  return await response.json();
}

export async function deleteChapter(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}`, {
    method: "DELETE",
  });
  return await res.json();
}

export async function downloadChapterScript(chapterId: number) {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/export-dialogue`);
  if (!res.ok) throw new Error("Не удалось экспортировать диалоги");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chapter_${chapterId}_dialogue.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function uploadChapterScript(chapterId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/chapters/${chapterId}/import-dialogue`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || "Ошибка импорта диалогов");
  return data;
}

export async function getProjects() {
  const res = await fetch(`${API_BASE_URL}/api/projects`);
  const data = await res.json();
  return data.projects || [];
}

export async function scanProjectFolder(name: string, folderPath: string) {
  const res = await fetch(`${API_BASE_URL}/api/projects/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder_path: folderPath }),
  });
  return await res.json();
}

export async function addChapterToProject(titleId: number, folderPath: string, chapterNumber?: string) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath, chapter_number: chapterNumber }),
  });
  return await res.json();
}

export async function getProjectTree(titleId: number) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/tree`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.title;
}

export async function updateTitleDescription(titleId: number, description: string) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/description`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return await res.json();
}

export async function getTitleSpeakers(titleId: number, chapterId?: number): Promise<string[]> {
  const query = chapterId ? `?chapter_id=${chapterId}` : "";
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/speakers${query}`);
  const data = await res.json();
  return data.speakers || [];
}

export async function deleteProject(titleId: number) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}`, {
    method: "DELETE",
  });
  return await res.json();
}

export async function getGlossary(titleId: number): Promise<GlossaryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary`);
  const data = await res.json();
  return data.items || [];
}

export async function addGlossaryItem(
  titleId: number,
  item: { jap_word?: string; rus_word: string; context?: string }
): Promise<GlossaryItem | null> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  const data = await res.json();
  return data.item || null;
}

export async function deleteGlossaryItem(titleId: number, entryId: number) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/glossary/${entryId}`, {
    method: "DELETE",
  });
  return await res.json();
}

export async function getProjectStats(titleId: number): Promise<ProjectStats | null> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/stats`);
  const data = await res.json();
  return data.stats || null;
}
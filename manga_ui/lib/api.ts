// lib/api.ts

// Адрес нашего локального Python-сервера (FastAPI)
const API_BASE_URL = "http://127.0.0.1:8000";

/**
 * Отправляет вырезанную картинку бабла на локальный Python-сервер
 * для распознавания японского текста (OCR)
 */
export async function runOcr(imageBlob: Blob): Promise<string> {
  const formData = new FormData();
  // FastAPI ожидает поле 'file', передаем туда наш Blob-картинку
  formData.append("file", imageBlob, "bubble.png");

  try {
    const response = await fetch(`${API_BASE_URL}/api/ocr`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Ошибка сервера OCR: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success) {
      return data.text; // Возвращаем распознанный текст
    } else {
      throw new Error(data.error || "Неизвестная ошибка OCR");
    }
  } catch (error) {
    console.error("OCR Request failed:", error);
    return "❌ Ошибка распознавания";
  }
}

/**
 * Отправляет японский текст на локальный Python-сервер,
 * который проксирует его в Gemini API для перевода.
 */
export async function runTranslate(
  japText: string,
  context: string = "",
  glossary: Record<string, string> = {}
): Promise<string> {
  if (!japText.trim()) return "";

  try {
    const response = await fetch(`${API_BASE_URL}/api/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // Формат должен совпадать с Pydantic моделью TranslationRequest в main.py
      body: JSON.stringify({
        text: japText,
        context: context,
        glossary: glossary,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка сервера перевода: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success) {
      return data.translated; // Возвращаем русский текст
    } else {
      throw new Error(data.error || "Неизвестная ошибка перевода");
    }
  } catch (error) {
    console.error("Translation Request failed:", error);
    return "❌ Ошибка перевода";
  }
}

/**
 * Отправляет целую страницу на сервер для автоматического поиска баблов
 */
export async function runAutoDetect(imageBlob: Blob): Promise<Array<{x: number, y: number, width: number, height: number}>> {
  const formData = new FormData();
  formData.append("file", imageBlob, "page.png");

  try {
    const response = await fetch(`${API_BASE_URL}/api/detect`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Ошибка сервера детекции");

    const data = await response.json();
    if (data.success) return data.boxes;
    throw new Error(data.error);
  } catch (error) {
    console.error("Detect Request failed:", error);
    return [];
  }
}


// Получить прямую ссылку на картинку страницы
export function getPageImageUrl(pageId: number): string {
  return `${API_BASE_URL}/api/pages/${pageId}/image`;
}

// Получить список всех тайтлов
export async function getProjects() {
  const res = await fetch(`${API_BASE_URL}/api/projects`);
  const data = await res.json();
  return data.projects || [];
}

// Запустить сканирование локальной папки
export async function scanProjectFolder(name: string, folderPath: string) {
  const res = await fetch(`${API_BASE_URL}/api/projects/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder_path: folderPath }),
  });
  return await res.json();
}

// Получить дерево: Тайтл -> Главы -> Страницы
export async function getProjectTree(titleId: number) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}/tree`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.title;
}

// Удалить проект
export async function deleteProject(titleId: number) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${titleId}`, {
    method: "DELETE",
  });
  return await res.json();
}

// Загрузить блоки страницы из БД
export async function getPageBlocks(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/blocks`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.blocks;
}

// Сохранить блоки страницы в БД
export async function savePageBlocks(
  pageId: number,
  blocks: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    jap_text: string;
    rus_text: string;
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

// lib/api.ts

// Детекция напрямую по ID страницы (без пересылки файлов)
export async function runPageAutoDetect(pageId: number): Promise<Array<{x: number, y: number, width: number, height: number}>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pages/${pageId}/detect`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Ошибка сервера детекции");
    const data = await response.json();
    if (data.success) return data.boxes;
    throw new Error(data.error);
  } catch (error) {
    console.error("Page Detect failed:", error);
    return [];
  }
}

/**
 * Отправляет сразу все японские фразы страницы в Gemini для связного перевода
 */
export async function runBatchTranslate(
  items: Array<{ id: string; text: string }>
): Promise<Record<string, string>> {
  if (items.length === 0) return {};

  try {
    const response = await fetch(`${API_BASE_URL}/api/translate/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) throw new Error("Ошибка пакетного перевода");
    const data = await response.json();
    if (data.success) {
      return data.translations; // Объект вида: { "id-блока": "Переведенный русский текст" }
    }
    throw new Error(data.error);
  } catch (error) {
    console.error("Batch translate failed:", error);
    return {};
  }
}

// Получить ссылку на очищенную картинку страницы
export function getPageCleanImageUrl(pageId: number): string {
  return `${API_BASE_URL}/api/pages/${pageId}/clean-image`;
}

// Запустить алгоритм очистки баблов на странице
export async function runCleanPage(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/clean`, {
    method: "POST",
  });
  return await res.json();
}

// Отправляет финальную готовую страницу на сохранение в папку 'translated'
export async function saveTranslatedPage(pageId: number, imageBlob: Blob) {
  const formData = new FormData();
  formData.append("file", imageBlob, "translated.png");

  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/save-translated`, {
    method: "POST",
    body: formData,
  });
  return await res.json();
}

// Открывает папку главы в Проводнике Windows
export async function openTranslatedFolder(pageId: number) {
  const res = await fetch(`${API_BASE_URL}/api/pages/${pageId}/open-folder`, {
    method: "POST",
  });
  return await res.json();
}

/**
 * Запускает перевод всей главы на бэкенде:
 * Бэкенд сам выполнит OCR и отправит ВСЕ реплики главы в Gemini за 1 запрос
 */
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
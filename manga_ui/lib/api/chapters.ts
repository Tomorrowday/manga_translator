// manga_ui/lib/api/chapters.ts
/**
 * Контракт API-запросов операций с главами, экспорта и импорта диалогов.
 * Реализация: manga_ui/lib/api/chapters_impl.ts
 * Зависимости реализации: manga_ui/lib/api/client (API_BASE_URL, handleApiResponse), FormData
 */

export {
  runTranslateChapter,
  deleteChapter,
  resetChapterBubbleFonts,
  exportChapterScriptToFolder,
  uploadChapterScript,
  pickAndImportChapterScript,
} from "./chapters_impl"
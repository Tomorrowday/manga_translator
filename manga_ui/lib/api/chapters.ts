// manga_ui/lib/api/chapters.ts
/**
 * Контракт API-запросов операций с главами, экспорта/импорта скриптов, таймера и статистики.
 * Реализация: manga_ui/lib/api/chapters_impl.ts
 */

export {
  runTranslateChapter,
  deleteChapter,
  resetChapterBubbleFonts,
  applyChapterFontSize,
  exportChapterScriptToFolder,
  uploadChapterScript,
  pickAndImportChapterScript,
  getChapterTimerStatus,
  startChapterTimer,
  stopChapterTimer,
  recalculateChapterStats,
} from "./chapters_impl"
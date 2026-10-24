// manga_ui/lib/api/pages.ts
/**
 * Контракт API-запросов операций со страницами манги, баблами, клином и экспортом.
 * Реализация: manga_ui/lib/api/pages_impl.ts
 * Зависимости реализации: manga_ui/lib/api/client (API_BASE_URL, handleApiResponse), FormData, Blob
 */

export {
  getPageImageUrl,
  getPageCleanImageUrl,
  releaseVram,
  getPageDetails,
  getPageSpeakers,
  runPageAutoDetect,
  getPageBlocks,
  savePageBlocks,
  runCleanPage,
  revertCleanPage,
  runSpotClean,
  saveTranslatedPage,
  openTranslatedFolder,
  runBrushClean,
} from "./pages_impl"
// manga_ui/lib/api/ai.ts
/**
 * Контракт API-запросов к модулям распознавания OCR и перевода текста.
 * Реализация: manga_ui/lib/api/ai_impl.ts
 * Зависимости реализации: manga_ui/lib/api/client (API_BASE_URL, handleApiResponse)
 */

export {
  runOcr,
  runTranslate,
  runBatchTranslate,
} from "./ai_impl"
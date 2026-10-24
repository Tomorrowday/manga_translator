// manga_ui/lib/api/ollama.ts
/**
 * Контракт клиента локальной нейросети Ollama (проверка соединения и пакетный перевод).
 * Реализация: manga_ui/lib/api/ollama_impl.ts
 * Зависимости реализации: fetch, AbortController, регулярные выражения парсинга ответов
 */

export interface OllamaModelInfo {
  name: string
  size: number
  modified_at: string
}

export {
  checkOllamaConnection,
  runOllamaBatchTranslate,
} from "./ollama_impl"
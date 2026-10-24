// manga_ui/components/manga-translator.tsx
/**
 * Корневой компонент-оркестратор рабочего пространства Manga Translator.
 *
 * Реализация: manga_ui/components/manga-translator_impl.tsx
 *
 * Управляемые стейты:
 * - currentPage, chapterPages, viewMode ('original' | 'clean'), cleanCacheBuster
 * - panelWidth (изменяемый сплиттером размер правой панели), isResizing
 * - globalSettings (настройки моделей, формы бабла, шрифтов, LaMa)
 * - titleFontSize (базовый кегль текущего тайтла)
 * - модальные окна: hotkeysModal, settingsModal
 *
 * Зависимости реализации:
 * - Хуки: @/hooks/use-page-blocks, @/hooks/use-page-pipelines, @/hooks/use-manga-hotkeys
 * - Дочерние компоненты:
 *   - @/components/sidebar (Explorer проектов и глав)
 *   - @/components/image-viewer (Просмотрщик скана и разметка)
 *   - @/components/translator-header (Шапка, навигация, сохранение)
 *   - @/components/batch-chapter-actions (Пакетные операции главы)
 *   - @/components/translation-toolbar (Панель страницы: Detect, Clean, Trans)
 *   - @/components/text-blocks-list (Список баблов и карточки)
 *   - @/components/hotkeys-modal, @/components/settings-modal
 * - API: @/lib/api (pages, projects, chapters)
 * - Утилиты: @/lib/typeset (cropRegion, mapDbBlockToTextBlock)
 */

export interface MangaTranslatorProps {}

export { MangaTranslator } from "./manga-translator_impl"
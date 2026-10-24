// manga_ui/lib/api/projects.ts
/**
 * Контракт API-запросов тайтлов, сканирования, глобальных настроек и глоссария.
 * Реализация: manga_ui/lib/api/projects_impl.ts
 * Зависимости реализации: manga_ui/lib/api/client (API_BASE_URL, handleApiResponse), types
 */

export {
  getGlobalSettings,
  updateGlobalSettings,
  getProjects,
  scanProjectFolder,
  rescanProject,
  addChapterToProject,
  getProjectTree,
  getAvailableDetectors,
  getAvailableCleaners,
  updateTitleSettings,
  getTitleSpeakers,
  deleteProject,
  getGlossary,
  addGlossaryItem,
  deleteGlossaryItem,
  getProjectStats,
} from "./projects_impl"
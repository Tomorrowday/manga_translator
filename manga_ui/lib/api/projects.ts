// manga_ui/lib/api/projects.ts
/**
 * Контракт API-запросов тайтлов, сканирования, глобальных настроек, глоссария и детальной статистики.
 * Реализация: manga_ui/lib/api/projects_impl.ts
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
  getAllDetailedStats,
  recalculateTitleStats,
} from "./projects_impl"

export type { TitleDetailedItem, ChapterDetailedItem } from "./projects_impl"
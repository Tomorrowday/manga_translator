"use client"

import { useState, useEffect, useCallback } from "react"
import {
  FolderTree,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  FileImage,
  Folder,
  FolderPlus,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  BookMarked,
  Sparkles,
  RefreshCw,
} from "lucide-react"
import type { TitleProject, ProjectTree, PageItem, PageStatus, ChapterItem } from "@/lib/types"
import {
  getProjects,
  getProjectTree,
  scanProjectFolder,
  rescanProject,
  addChapterToProject,
  deleteChapter,
  deleteProject,
} from "@/lib/api"
import { ProjectModal } from "@/components/project-modal"

interface SidebarProps {
  currentPageId: number | null
  activePageUpdate?: { id: number; status: PageStatus; clean_path?: string } | null
  refreshTrigger?: number
  onSelectPage: (page: PageItem) => void
  onActiveChapterChange?: (pages: PageItem[]) => void
  onChapterDeleted?: (chapterId: number) => void
}

const STATUS_CONFIG: Record<PageStatus, { color: string; label: string }> = {
  raw: { color: "bg-slate-600", label: "Raw (Без разметки)" },
  new: { color: "bg-slate-600", label: "Raw (Новая)" },
  detected: { color: "bg-sky-400", label: "Detected (OCR готов)" },
  cleaned: { color: "bg-purple-400", label: "Cleaned (Скан очищен)" },
  translated: { color: "bg-amber-400", label: "Translated (Переведено)" },
  done: { color: "bg-emerald-400", label: "Done (Экспортировано)" },
}

export function Sidebar({
  currentPageId,
  activePageUpdate,
  refreshTrigger,
  onSelectPage,
  onActiveChapterChange,
  onChapterDeleted,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [projects, setProjects] = useState<TitleProject[]>([])
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null)
  const [projectTree, setProjectTree] = useState<ProjectTree | null>(null)
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({})

  const [loadingTree, setLoadingTree] = useState(false)
  const [isRescanning, setIsRescanning] = useState(false)

  // Модалка создания нового тайтла
  const [isScanning, setIsScanning] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanName, setScanName] = useState("")
  const [scanPath, setScanPath] = useState("")

  // Модалка добавления главы в существующий тайтл
  const [showAddChapterModal, setShowAddChapterModal] = useState(false)
  const [chapterPath, setChapterPath] = useState("")
  const [chapterNumber, setChapterNumber] = useState("")
  const [isAddingChapter, setIsAddingChapter] = useState(false)

  // Модалка проекта (Глоссарий, Синопсис, Статистика)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectModalTab, setProjectModalTab] = useState<"glossary" | "synopsis" | "stats">("glossary")

  const loadProjects = useCallback(async () => {
    try {
      const list = await getProjects()
      setProjects(list)
      setSelectedTitleId((prev) => {
        if (prev !== null && list.some((p: TitleProject) => p.id === prev)) {
          return prev
        }
        return list.length > 0 ? list[0].id : null
      })
    } catch (e) {
      console.error("Ошибка загрузки проектов:", e)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const loadTree = useCallback(async (titleId: number) => {
    setLoadingTree(true)
    try {
      const tree = await getProjectTree(titleId)
      setProjectTree(tree)
      if (tree.chapters && tree.chapters.length > 0) {
        setExpandedChapters((prev) => (Object.keys(prev).length === 0 ? { [tree.chapters[0].id]: true } : prev))
      }
    } catch (e) {
      console.error("Ошибка загрузки глав:", e)
    } finally {
      setLoadingTree(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTitleId) {
      loadTree(selectedTitleId)
    } else {
      setProjectTree(null)
    }
  }, [selectedTitleId, loadTree, refreshTrigger])

  useEffect(() => {
    if (!activePageUpdate) return

    setProjectTree((prev: ProjectTree | null) => {
      if (!prev || !prev.chapters) return prev
      const updatedChapters = prev.chapters.map((ch: ChapterItem) => ({
        ...ch,
        pages: ch.pages.map((p: PageItem) =>
          p.id === activePageUpdate.id
            ? {
                ...p,
                status: activePageUpdate.status,
                clean_path: activePageUpdate.clean_path !== undefined ? activePageUpdate.clean_path : p.clean_path,
              }
            : p
        ),
      }))
      return { ...prev, chapters: updatedChapters }
    })
  }, [activePageUpdate])

  const toggleChapter = (chapterId: number) => {
    setExpandedChapters((prev) => ({ ...prev, [chapterId]: !prev[chapterId] }))
  }

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanName.trim() || !scanPath.trim()) return
    setIsScanning(true)
    try {
      const res = await scanProjectFolder(scanName, scanPath)
      if (res.success) {
        setShowScanModal(false)
        setScanName("")
        setScanPath("")
        await loadProjects()
      } else {
        alert("Ошибка: " + res.error)
      }
    } catch (e) {
      alert("Не удалось отсканировать папку: " + String(e))
    } finally {
      setIsScanning(false)
    }
  }

  const handleRescanTitle = async () => {
    if (!selectedTitleId || isRescanning) return
    setIsRescanning(true)
    try {
      const res = await rescanProject(selectedTitleId)
      alert(res.message || "Сканирование завершено!")
      await loadTree(selectedTitleId)
    } catch (err) {
      alert("Ошибка повторного сканирования: " + String(err))
    } finally {
      setIsRescanning(false)
    }
  }

  const handleAddChapterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTitleId || !chapterPath.trim()) return

    setIsAddingChapter(true)
    try {
      const res = await addChapterToProject(selectedTitleId, chapterPath.trim(), chapterNumber.trim())
      if (res.success) {
        setShowAddChapterModal(false)
        setChapterPath("")
        setChapterNumber("")
        await loadTree(selectedTitleId)
      } else {
        alert("Ошибка: " + (res.error || res.detail))
      }
    } catch (e) {
      alert("Не удалось добавить главу: " + String(e))
    } finally {
      setIsAddingChapter(false)
    }
  }

  const handleDeleteChapter = async (e: React.MouseEvent, chapterId: number, chapterNum: string) => {
    e.stopPropagation()
    if (!confirm(`Удалить главу "${chapterNum}" из этого тайтла? Сканы на диске останутся нетронутыми.`)) return

    try {
      const res = await deleteChapter(chapterId)
      if (res.success) {
        onChapterDeleted?.(chapterId)
        if (selectedTitleId) {
          await loadTree(selectedTitleId)
        }
      }
    } catch (err) {
      alert("Ошибка удаления главы: " + String(err))
    }
  }

  const handleDeleteTitle = async (titleId: number) => {
    if (!confirm("Удалить этот тайтл из базы? Файлы на диске затронуты не будут.")) return
    await deleteProject(titleId)
    setSelectedTitleId(null)
    await loadProjects()
  }

  const selectedProject = projects.find((p) => p.id === selectedTitleId)

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute left-3 top-14 z-30 flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900/90 text-slate-400 backdrop-blur hover:bg-slate-800 hover:text-white"
        title="Open Project Explorer"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>
    )
  }

  return (
    <aside className="relative flex h-full w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Explorer</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowScanModal(true)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-indigo-300 transition-colors"
            title="Сканировать новый тайтл"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Свернуть Explorer"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-slate-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedTitleId || ""}
            onChange={(e) => setSelectedTitleId(Number(e.target.value))}
            className="w-full rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
          >
            {projects.length === 0 ? (
              <option value="">No titles scanned</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>

          {selectedTitleId && (
            <button
              onClick={() => handleDeleteTitle(selectedTitleId)}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition-colors"
              title="Удалить тайтл из базы"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {selectedTitleId && (
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            <button
              onClick={() => {
                setProjectModalTab("glossary")
                setShowProjectModal(true)
              }}
              className="flex items-center justify-center gap-1 rounded border border-slate-800 bg-slate-900 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              title="Глоссарий и персонажи"
            >
              <BookMarked className="h-3 w-3 text-indigo-400" />
              Глоссарий
            </button>

            <button
              onClick={() => {
                setProjectModalTab("synopsis")
                setShowProjectModal(true)
              }}
              className="flex items-center justify-center gap-1 rounded border border-slate-800 bg-slate-900 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              title="Синопсис и стиль речи"
            >
              <Sparkles className="h-3 w-3 text-amber-400" />
              Стиль
            </button>

            <button
              onClick={handleRescanTitle}
              disabled={isRescanning}
              className="flex items-center justify-center gap-1 rounded border border-slate-800 bg-slate-900 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
              title="Проверить папку на новые главы (существующие не трогать)"
            >
              {isRescanning ? (
                <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
              ) : (
                <RefreshCw className="h-3 w-3 text-sky-400" />
              )}
              Скан
            </button>

            <button
              onClick={() => setShowAddChapterModal(true)}
              className="flex items-center justify-center gap-1 rounded border border-slate-800 bg-indigo-950/40 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-900/60 hover:text-indigo-100 transition-colors"
              title="Добавить главу в этот тайтл"
            >
              <FolderPlus className="h-3 w-3 text-indigo-400" />
              + Глава
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loadingTree ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : !projectTree || !projectTree.chapters || projectTree.chapters.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-600">
            В этом тайтле пока нет глав. Нажмите «+ Глава» или «Скан», чтобы добавить.
          </div>
        ) : (
          <div className="space-y-1">
            {projectTree.chapters.map((ch: ChapterItem) => {
              const isExpanded = !!expandedChapters[ch.id]
              return (
                <div key={ch.id} className="group/ch rounded-md">
                  <div className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-slate-900">
                    <button
                      onClick={() => toggleChapter(ch.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium text-slate-300"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      )}
                      <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
                      <span className="truncate">{ch.chapter_number}</span>
                      <span className="ml-1 text-[10px] text-slate-600">({ch.pages.length}p)</span>
                    </button>

                    <button
                      onClick={(e) => handleDeleteChapter(e, ch.id, ch.chapter_number)}
                      className="rounded p-1 text-slate-600 opacity-0 group-hover/ch:opacity-100 hover:bg-slate-800 hover:text-rose-400 transition-all"
                      title="Удалить только эту главу"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-800 pl-2">
                      {ch.pages.map((p: PageItem) => {
                        const isSelected = p.id === currentPageId
                        const statusConfig = STATUS_CONFIG[p.status as PageStatus] || STATUS_CONFIG.raw

                        return (
                          <button
                            key={p.id}
                            onClick={() => {
                              onSelectPage(p)
                              onActiveChapterChange?.(ch.pages)
                            }}
                            className={[
                              "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors",
                              isSelected
                                ? "bg-indigo-600/30 font-medium text-indigo-200"
                                : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
                            ].join(" ")}
                          >
                            <FileImage className="h-3 w-3 shrink-0" />
                            <span className="truncate">Page {p.page_number}</span>
                            <span
                              className={`ml-auto h-2 w-2 rounded-full ${statusConfig.color}`}
                              title={`Status: ${statusConfig.label}`}
                            />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">Сканировать новый тайтл</h3>
            <p className="mt-1 text-xs text-slate-400">
              Создаст новый проект тайтла и просканирует все папки глав внутри.
            </p>

            <form onSubmit={handleScanSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400">Название тайтла</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chainsaw Man"
                  value={scanName}
                  onChange={(e) => setScanName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400">Путь к корневой папке</label>
                <input
                  type="text"
                  required
                  placeholder="D:\Manga\ChainsawMan"
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScanModal(false)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isScanning}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isScanning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Сканировать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddChapterModal && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">Добавить главу в &laquo;{selectedProject.name}&raquo;</h3>
            <p className="mt-1 text-xs text-slate-400">
              Новая глава сразу унаследует синопсис и глоссарий этого тайтла.
            </p>

            <form onSubmit={handleAddChapterSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400">Путь к папке главы (или тома)</label>
                <input
                  type="text"
                  required
                  placeholder="D:\Manga\ChainsawMan\Chapter_102"
                  value={chapterPath}
                  onChange={(e) => setChapterPath(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400">
                  Номер/Имя главы <span className="text-slate-500">(опционально, по умолчанию имя папки)</span>
                </label>
                <input
                  type="text"
                  placeholder="например: Chapter 102"
                  value={chapterNumber}
                  onChange={(e) => setChapterNumber(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddChapterModal(false)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isAddingChapter}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isAddingChapter && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Добавить главу
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProjectModal && selectedTitleId && (
        <ProjectModal
          titleId={selectedTitleId}
          titleName={selectedProject?.name || "Проект"}
          initialTab={projectModalTab}
          onClose={() => setShowProjectModal(false)}
        />
      )}
    </aside>
  )
}
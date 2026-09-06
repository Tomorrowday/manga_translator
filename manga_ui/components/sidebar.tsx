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
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import type { TitleProject, ProjectTree, PageItem } from "@/lib/types"
import { getProjects, getProjectTree, scanProjectFolder, deleteProject } from "@/lib/api"

interface SidebarProps {
  currentPageId: number | null
  onSelectPage: (page: PageItem) => void
  onActiveChapterChange?: (pages: PageItem[]) => void
}

export function Sidebar({ currentPageId, onSelectPage, onActiveChapterChange }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [projects, setProjects] = useState<TitleProject[]>([])
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null)
  const [projectTree, setProjectTree] = useState<ProjectTree | null>(null)
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({})

  const [loadingTree, setLoadingTree] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanName, setScanName] = useState("")
  const [scanPath, setScanPath] = useState("")

  // Загрузка списка тайтлов
  const loadProjects = useCallback(async () => {
    try {
      const list = await getProjects()
      setProjects(list)
      if (list.length > 0 && !selectedTitleId) {
        setSelectedTitleId(list[0].id)
      }
    } catch (e) {
      console.error("Ошибка загрузки проектов:", e)
    }
  }, [selectedTitleId])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Загрузка дерева выбранного тайтла
  const loadTree = useCallback(async (titleId: number) => {
    setLoadingTree(true)
    try {
      const tree = await getProjectTree(titleId)
      setProjectTree(tree)
      // По умолчанию открываем первую главу
      if (tree.chapters && tree.chapters.length > 0) {
        setExpandedChapters({ [tree.chapters[0].id]: true })
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
  }, [selectedTitleId, loadTree])

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

  const handleDeleteTitle = async (titleId: number) => {
    if (!confirm("Удалить этот тайтл из базы? Файлы на диске затронуты не будут.")) return
    await deleteProject(titleId)
    setSelectedTitleId(null)
    await loadProjects()
  }

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
    <aside className="relative flex h-full w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80 backdrop-blur">
      {/* Шапка сайдбара */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Explorer</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowScanModal(true)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-indigo-300"
            title="Scan New Folder"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Collapse Sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Селектор тайтла */}
      <div className="border-b border-slate-800 p-3">
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
              className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
              title="Delete Title"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Дерево Глав и Страниц */}
      <div className="flex-1 overflow-y-auto p-2">
        {loadingTree ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : !projectTree || !projectTree.chapters || projectTree.chapters.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-600">
            No chapters found in this project.
          </div>
        ) : (
          <div className="space-y-1">
            {projectTree.chapters.map((ch) => {
              const isExpanded = !!expandedChapters[ch.id]
              return (
                <div key={ch.id} className="rounded-md">
                  <button
                    onClick={() => toggleChapter(ch.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-slate-300 hover:bg-slate-900"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    <Folder className="h-3.5 w-3.5 text-amber-500/80" />
                    <span className="truncate">Chapter {ch.chapter_number}</span>
                    <span className="ml-auto text-[10px] text-slate-600">{ch.pages.length}p</span>
                  </button>

                  {isExpanded && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-800 pl-2">
                      {ch.pages.map((p) => {
                        const isSelected = p.id === currentPageId
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
                              className={[
                                "ml-auto h-1.5 w-1.5 rounded-full",
                                p.status === "done"
                                  ? "bg-emerald-400"
                                  : p.status === "in_progress"
                                  ? "bg-sky-400"
                                  : "bg-slate-700",
                              ].join(" ")}
                              title={`Status: ${p.status}`}
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

      {/* Модальное окно сканирования папки */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">Scan Manga Folder</h3>
            <p className="mt-1 text-xs text-slate-400">
              Enter Title name and absolute path on your PC (e.g. D:\Manga\ChainsawMan).
            </p>

            <form onSubmit={handleScanSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400">Title Name</label>
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
                <label className="block text-[11px] font-medium text-slate-400">Folder Path</label>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isScanning}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isScanning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Scan Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}

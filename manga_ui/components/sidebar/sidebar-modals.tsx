// manga_ui/components/sidebar/sidebar-modals.tsx
// Модальные окна сканирования проекта и добавления главы в тайтл

"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

interface SidebarModalsProps {
  showScanModal: boolean
  showAddChapterModal: boolean
  selectedProjectName?: string
  onCloseScanModal: () => void
  onCloseAddChapterModal: () => void
  onScanProject: (name: string, path: string) => Promise<boolean>
  onAddChapter: (path: string, chapterNumber?: string) => Promise<boolean>
}

export function SidebarModals({
  showScanModal,
  showAddChapterModal,
  selectedProjectName,
  onCloseScanModal,
  onCloseAddChapterModal,
  onScanProject,
  onAddChapter,
}: SidebarModalsProps) {
  const [scanName, setScanName] = useState("")
  const [scanPath, setScanPath] = useState("")
  const [isScanning, setIsScanning] = useState(false)

  const [chapterPath, setChapterPath] = useState("")
  const [chapterNumber, setChapterNumber] = useState("")
  const [isAddingChapter, setIsAddingChapter] = useState(false)

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanName.trim() || !scanPath.trim()) return
    setIsScanning(true)
    try {
      const ok = await onScanProject(scanName.trim(), scanPath.trim())
      if (ok) {
        setScanName("")
        setScanPath("")
        onCloseScanModal()
      }
    } finally {
      setIsScanning(false)
    }
  }

  const handleAddChapterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chapterPath.trim()) return
    setIsAddingChapter(true)
    try {
      const ok = await onAddChapter(chapterPath.trim(), chapterNumber.trim())
      if (ok) {
        setChapterPath("")
        setChapterNumber("")
        onCloseAddChapterModal()
      }
    } finally {
      setIsAddingChapter(false)
    }
  }

  return (
    <>
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
                  onClick={onCloseScanModal}
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

      {showAddChapterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">
              Добавить главу в &laquo;{selectedProjectName || "Тайтл"}&raquo;
            </h3>
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
                  onClick={onCloseAddChapterModal}
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
    </>
  )
}
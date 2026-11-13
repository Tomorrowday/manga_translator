// manga_ui/components/project-modal_impl.tsx
// Оркестратор модалки проекта: шапка с переключением вкладок, загрузка данных и портал.
// Вкладки вынесены в components/project-modal/: «Глоссарий» и «Синопсис».

"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { BookMarked, Sliders, X } from "lucide-react"
import type { GlossaryItem } from "@/lib/types"
import {
  getGlossary,
  addGlossaryItem,
  deleteGlossaryItem,
  getProjectTree,
  updateTitleSettings,
} from "@/lib/api"
import { GlossaryTab } from "@/components/project-modal/glossary-tab"
import { SynopsisTab } from "@/components/project-modal/synopsis-tab"
import type { ProjectModalProps } from "./project-modal"

export function ProjectModal({
  titleId,
  titleName,
  initialTab = "glossary",
  onClose,
  onSettingsUpdated,
}: ProjectModalProps) {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<"glossary" | "synopsis">(initialTab)

  const [description, setDescription] = useState("")
  const [loadingDesc, setLoadingDesc] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false)

  const [glossary, setGlossary] = useState<GlossaryItem[]>([])
  const [loadingGlossary, setLoadingGlossary] = useState(false)
  const [japWord, setJapWord] = useState("")
  const [rusWord, setRusWord] = useState("")
  const [context, setContext] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [onClose])

  const loadProjectInfo = useCallback(async () => {
    setLoadingDesc(true)
    try {
      const data = await getProjectTree(titleId)
      if (data && data.description !== undefined) {
        setDescription(data.description || "")
      }
    } finally {
      setLoadingDesc(false)
    }
  }, [titleId])

  const loadGlossary = useCallback(async () => {
    setLoadingGlossary(true)
    try {
      const list = await getGlossary(titleId)
      setGlossary(list)
    } finally {
      setLoadingGlossary(false)
    }
  }, [titleId])

  useEffect(() => {
    loadProjectInfo()
  }, [loadProjectInfo])

  useEffect(() => {
    if (activeTab === "glossary") loadGlossary()
    if (activeTab === "synopsis") loadProjectInfo()
  }, [activeTab, loadGlossary, loadProjectInfo])

  const handleSaveSettings = async () => {
    setIsSavingSettings(true)
    try {
      const res = await updateTitleSettings(titleId, {
        description: description.trim(),
      })
      if (res.success) {
        setSettingsSavedSuccess(true)
        onSettingsUpdated?.(res.description)
        setTimeout(() => setSettingsSavedSuccess(false), 2000)
      }
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleAddGlossary = async () => {
    if (!rusWord.trim()) return

    setIsAdding(true)
    try {
      const item = await addGlossaryItem(titleId, {
        jap_word: japWord.trim(),
        rus_word: rusWord.trim(),
        context: context.trim(),
      })
      if (item) {
        setGlossary((prev) => [item, ...prev])
        setJapWord("")
        setRusWord("")
        setContext("")
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteGlossary = async (id: number) => {
    await deleteGlossaryItem(titleId, id)
    setGlossary((prev) => prev.filter((it) => it.id !== id))
  }

  if (!mounted) return null

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="flex h-[620px] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-white">{titleName}</h3>
            <p className="text-xs text-slate-400">Управление глоссарием персонажей и синопсисом тайтла</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              <button
                onClick={() => setActiveTab("glossary")}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "glossary"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                <BookMarked className="h-3.5 w-3.5" />
                Глоссарий
              </button>

              <button
                onClick={() => setActiveTab("synopsis")}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "synopsis"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                <Sliders className="h-3.5 w-3.5" />
                Синопсис
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Закрыть (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {activeTab === "glossary" && (
            <GlossaryTab
              glossary={glossary}
              loading={loadingGlossary}
              isAdding={isAdding}
              japWord={japWord}
              rusWord={rusWord}
              context={context}
              onJapWordChange={setJapWord}
              onRusWordChange={setRusWord}
              onContextChange={setContext}
              onAdd={handleAddGlossary}
              onDelete={handleDeleteGlossary}
            />
          )}

          {activeTab === "synopsis" && (
            <SynopsisTab
              description={description}
              onDescriptionChange={setDescription}
              loading={loadingDesc}
              isSaving={isSavingSettings}
              savedSuccess={settingsSavedSuccess}
              onSave={handleSaveSettings}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

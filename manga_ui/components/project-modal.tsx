"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  BookMarked,
  BarChart3,
  FileText,
  Plus,
  Trash2,
  X,
  Loader2,
  Sparkles,
  Save,
  Check,
} from "lucide-react"
import type { GlossaryItem, ProjectStats } from "@/lib/types"
import {
  getGlossary,
  addGlossaryItem,
  deleteGlossaryItem,
  getProjectStats,
  getProjectTree,
  updateTitleDescription,
} from "@/lib/api"

interface ProjectModalProps {
  titleId: number
  titleName: string
  initialTab?: "glossary" | "synopsis" | "stats"
  onClose: () => void
  onDescriptionUpdated?: (newDescription: string) => void
}

export function ProjectModal({
  titleId,
  titleName,
  initialTab = "glossary",
  onClose,
  onDescriptionUpdated,
}: ProjectModalProps) {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<"glossary" | "synopsis" | "stats">(initialTab)

  // Синопсис и стиль
  const [description, setDescription] = useState("")
  const [loadingDesc, setLoadingDesc] = useState(false)
  const [isSavingDesc, setIsSavingDesc] = useState(false)
  const [descSavedSuccess, setDescSavedSuccess] = useState(false)

  // Глоссарий
  const [glossary, setGlossary] = useState<GlossaryItem[]>([])
  const [loadingGlossary, setLoadingGlossary] = useState(false)
  const [japWord, setJapWord] = useState("")
  const [rusWord, setRusWord] = useState("")
  const [context, setContext] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  // Статистика
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Закрытие по Escape
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

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const data = await getProjectStats(titleId)
      setStats(data)
    } finally {
      setLoadingStats(false)
    }
  }, [titleId])

  useEffect(() => {
    loadProjectInfo()
  }, [loadProjectInfo])

  useEffect(() => {
    if (activeTab === "glossary") loadGlossary()
    if (activeTab === "stats") loadStats()
    if (activeTab === "synopsis") loadProjectInfo()
  }, [activeTab, loadGlossary, loadStats, loadProjectInfo])

  const handleSaveDescription = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setIsSavingDesc(true)
    try {
      await updateTitleDescription(titleId, description)
      setDescSavedSuccess(true)
      onDescriptionUpdated?.(description)
      setTimeout(() => setDescSavedSuccess(false), 2000)
    } finally {
      setIsSavingDesc(false)
    }
  }

  const handleAddGlossary = async (e: React.FormEvent) => {
    e.preventDefault()
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
      <div className="flex h-[600px] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Шапка модалки */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-white">{titleName}</h3>
            <p className="text-xs text-slate-400">Управление тайтлом, персонажами, стилем и базой данных</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Переключатель вкладок */}
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
                <FileText className="h-3.5 w-3.5" />
                Синопсис и Стиль
              </button>

              <button
                onClick={() => setActiveTab("stats")}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "stats"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Статистика БД
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

        {/* Тело модалки */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">

          {/* ВКЛАДКА 1: ГЛОССАРИЙ */}
          {activeTab === "glossary" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-indigo-950 bg-indigo-950/30 p-3.5 text-xs text-indigo-200">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                <p>
                  Имена и термины из глоссария отправляются в Gemini при переводе,
                  а также пополняют умные подсказки поля «Speaker». Для ролей без японского имени (Толпа, Рассказчик)
                  первое поле можно оставить пустым.
                </p>
              </div>

              {/* Форма добавления */}
              <form onSubmit={handleAddGlossary} className="flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
                <input
                  type="text"
                  placeholder="Японский (опционально)"
                  value={japWord}
                  onChange={(e) => setJapWord(e.target.value)}
                  className="w-1/3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <input
                  type="text"
                  required
                  placeholder="Имя/Роль (Толпа, Дэндзи)"
                  value={rusWord}
                  onChange={(e) => setRusWord(e.target.value)}
                  className="w-1/3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Контекст/тон (фоновые крики, грубо)"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  title="Добавить персонажа / термин"
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
              </form>

              {/* Таблица */}
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Японский оригинал</th>
                      <th className="px-4 py-2.5 font-semibold">Имя / Термин</th>
                      <th className="px-4 py-2.5 font-semibold">Контекст / Роль</th>
                      <th className="w-10 px-4 py-2.5 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {loadingGlossary ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500">
                          <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1 text-slate-400" />
                          Загрузка глоссария...
                        </td>
                      </tr>
                    ) : glossary.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500">
                          Глоссарий пока пуст. Добавьте персонажей или термины выше.
                        </td>
                      </tr>
                    ) : (
                      glossary.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-2.5 font-semibold text-slate-200">
                            {item.jap_word ? (
                              item.jap_word
                            ) : (
                              <span className="text-slate-500 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-emerald-400">{item.rus_word}</td>
                          <td className="px-4 py-2.5 text-slate-400">{item.context || "—"}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => handleDeleteGlossary(item.id)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ВКЛАДКА 2: СИНОПСИС И СТИЛЬ ПОВЕСТВОВАНИЯ */}
          {activeTab === "synopsis" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-indigo-950 bg-indigo-950/30 p-3.5 text-xs text-indigo-200">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                <p>
                  Этот синопсис и описание характеров напрямую передаются в Gemini при каждом переводе главы или страницы,
                  а также попадают в JSON-скрипт для Claude/ChatGPT. Опишите здесь ключевые особенности речи героев!
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Синопсис, атмосфера и правила речи персонажей
                </label>

                {loadingDesc ? (
                  <div className="flex h-36 items-center justify-center text-xs text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-slate-400" /> Загрузка...
                  </div>
                ) : (
                  <textarea
                    rows={8}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Например:
Мрачный сёнэн с элементами комедии абсурда.
- Дэндзи: матерится, говорит грубо и просторечно, обращается фамильярно.
- Макима: подчёркнуто вежливая, манипулятивная, холодная, обращается уважительно.
- Пауэр: хвастливая, крикливая, иногда говорит о себе в третьем лице.
- Аки: серьёзный, уставший, официальный деловой тон."
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                  />
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Используется в промптах перевода всех глав тайтла.
                  </span>

                  <button
                    onClick={() => handleSaveDescription()}
                    disabled={isSavingDesc}
                    className={[
                      "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-all shadow-md",
                      descSavedSuccess
                        ? "bg-emerald-600"
                        : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50",
                    ].join(" ")}
                  >
                    {isSavingDesc ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : descSavedSuccess ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {descSavedSuccess ? "Сохранено!" : "Сохранить синопсис"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ВКЛАДКА 3: СТАТИСТИКА БД */}
          {activeTab === "stats" && (
            <div className="space-y-4">
              {loadingStats || !stats ? (
                <div className="flex h-48 items-center justify-center text-xs text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-slate-400" /> Загрузка данных...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <p className="text-xs font-medium text-slate-400">Глав в проекте</p>
                      <p className="mt-1.5 text-2xl font-bold text-white">{stats.total_chapters}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <p className="text-xs font-medium text-slate-400">Всего страниц</p>
                      <p className="mt-1.5 text-2xl font-bold text-white">{stats.total_pages}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <p className="text-xs font-medium text-slate-400">Терминов в глоссарии</p>
                      <p className="mt-1.5 text-2xl font-bold text-indigo-400">{stats.total_glossary}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>Прогресс перевода реплик</span>
                      <span className="text-emerald-400">
                        {stats.total_blocks > 0
                          ? Math.round((stats.translated_blocks / stats.total_blocks) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                        style={{
                          width: `${
                            stats.total_blocks > 0
                              ? (stats.translated_blocks / stats.total_blocks) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-right text-xs text-slate-500">
                      Переведено {stats.translated_blocks} из {stats.total_blocks} баблов
                    </p>
                  </div>

                  {/* СТАДИИ В НОВОМ ПОРЯДКЕ: Raw -> Detected -> Cleaned -> Translated -> Done */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-xs font-semibold text-slate-300">Распределение страниц по стадиям</p>
                    <div className="mt-3 grid grid-cols-5 gap-2.5 text-center text-xs">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="block h-2 w-2 mx-auto mb-1.5 rounded-full bg-slate-600" />
                        <span className="text-[10px] text-slate-400">Raw</span>
                        <p className="font-bold text-slate-200 mt-0.5">{stats.pages_raw}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="block h-2 w-2 mx-auto mb-1.5 rounded-full bg-sky-400" />
                        <span className="text-[10px] text-slate-400">Detected</span>
                        <p className="font-bold text-sky-400 mt-0.5">{stats.pages_detected}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="block h-2 w-2 mx-auto mb-1.5 rounded-full bg-purple-400" />
                        <span className="text-[10px] text-slate-400">Cleaned</span>
                        <p className="font-bold text-purple-400 mt-0.5">{stats.pages_cleaned}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="block h-2 w-2 mx-auto mb-1.5 rounded-full bg-amber-400" />
                        <span className="text-[10px] text-slate-400">Translated</span>
                        <p className="font-bold text-amber-400 mt-0.5">{stats.pages_translated}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="block h-2 w-2 mx-auto mb-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] text-slate-400">Done</span>
                        <p className="font-bold text-emerald-400 mt-0.5">{stats.pages_done}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
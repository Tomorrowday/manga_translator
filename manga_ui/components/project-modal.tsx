"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  BookMarked,
  BarChart3,
  Sliders,
  Plus,
  Trash2,
  X,
  Loader2,
  Sparkles,
  Save,
  Check,
  Type,
  Scan,
} from "lucide-react"
import type { GlossaryItem, ProjectStats } from "@/lib/types"
import {
  getGlossary,
  addGlossaryItem,
  deleteGlossaryItem,
  getProjectStats,
  getProjectTree,
  updateTitleSettings,
} from "@/lib/api"

interface ProjectModalProps {
  titleId: number
  titleName: string
  initialTab?: "glossary" | "synopsis" | "stats"
  onClose: () => void
  onSettingsUpdated?: (newDescription: string, newFontSize: number, newDetector: string) => void
}

export function ProjectModal({
  titleId,
  titleName,
  initialTab = "glossary",
  onClose,
  onSettingsUpdated,
}: ProjectModalProps) {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<"glossary" | "synopsis" | "stats">(initialTab)

  // Синопсис, базовый размер шрифта и детектор
  const [description, setDescription] = useState("")
  const [defaultFontSize, setDefaultFontSize] = useState<number>(14)
  const [detectorModel, setDetectorModel] = useState<string>("yolo_manga.pt")
  const [availableDetectors, setAvailableDetectors] = useState<Record<string, string>>({})
  const [loadingDesc, setLoadingDesc] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false)

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
      if (data) {
        if (data.description !== undefined) setDescription(data.description || "")
        if (data.default_font_size !== undefined) setDefaultFontSize(data.default_font_size || 14)
        if (data.detector_model) setDetectorModel(data.detector_model)
        if (data.available_detectors) {
          setAvailableDetectors(data.available_detectors)
          // Если текущая модель отсутствует в списке, выставляем первую доступную
          if (!data.available_detectors[data.detector_model || ""]) {
            const firstKey = Object.keys(data.available_detectors)[0]
            if (firstKey) setDetectorModel(firstKey)
          }
        }
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

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setIsSavingSettings(true)
    try {
      const res = await updateTitleSettings(titleId, {
        description: description.trim(),
        default_font_size: defaultFontSize,
        detector_model: detectorModel,
      })
      if (res.success) {
        setSettingsSavedSuccess(true)
        onSettingsUpdated?.(res.description, res.default_font_size, res.detector_model)
        setTimeout(() => setSettingsSavedSuccess(false), 2000)
      }
    } finally {
      setIsSavingSettings(false)
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
      <div className="flex h-[620px] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

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
                <Sliders className="h-3.5 w-3.5" />
                Стиль и Настройки
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

          {/* ВКЛАДКА 2: СИНОПСИС И НАСТРОЙКИ ТАЙТЛА */}
          {activeTab === "synopsis" && (
            <div className="space-y-4">

              {/* ВЫБОР НЕЙРОСЕТИ ДЕТЕКЦИИ */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Scan className="h-3.5 w-3.5 text-indigo-400" />
                      Модель детекции (weights/detect-bubble)
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Используется при автодетекте «1. Detect & OCR» для всех страниц этого тайтла.
                    </p>
                  </div>

                  <div className="w-64">
                    <select
                      value={detectorModel}
                      onChange={(e) => setDetectorModel(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 outline-none focus:border-indigo-500"
                    >
                      {Object.keys(availableDetectors).length > 0 ? (
                        Object.entries(availableDetectors).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))
                      ) : (
                        <option value={detectorModel}>{detectorModel}</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Блок настройки базового шрифта манги */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Type className="h-3.5 w-3.5 text-indigo-400" />
                      Базовый размер шрифта по умолчанию
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Применяется ко всем баблам во всех главах этого тайтла (если размер не переопределён вручную).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDefaultFontSize((prev) => Math.max(8, prev - 1))}
                      className="h-7 w-7 rounded bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white"
                      title="Уменьшить на 1"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={8}
                      max={40}
                      value={defaultFontSize}
                      onChange={(e) => setDefaultFontSize(Math.max(8, Math.min(40, Number(e.target.value) || 14)))}
                      className="h-7 w-14 rounded border border-slate-700 bg-slate-900 text-center font-mono text-xs font-bold text-indigo-300 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setDefaultFontSize((prev) => Math.min(40, prev + 1))}
                      className="h-7 w-7 rounded bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white"
                      title="Увеличить на 1"
                    >
                      +
                    </button>
                    <span className="text-xs text-slate-400 font-mono">px</span>
                  </div>
                </div>
              </div>

              {/* Блок синопсиса и стиля речи */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Синопсис, атмосфера и правила речи персонажей
                </label>

                {loadingDesc ? (
                  <div className="flex h-32 items-center justify-center text-xs text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-slate-400" /> Загрузка...
                  </div>
                ) : (
                  <textarea
                    rows={7}
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
                    onClick={() => handleSaveSettings()}
                    disabled={isSavingSettings}
                    className={[
                      "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-all shadow-md",
                      settingsSavedSuccess
                        ? "bg-emerald-600"
                        : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50",
                    ].join(" ")}
                  >
                    {isSavingSettings ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : settingsSavedSuccess ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {settingsSavedSuccess ? "Сохранено!" : "Сохранить настройки"}
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
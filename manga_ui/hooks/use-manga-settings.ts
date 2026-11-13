// manga_ui/hooks/use-manga-settings.ts
// Глобальные настройки приложения и базовый кегль шрифта текущего тайтла

import { useState, useEffect, useCallback } from "react"
import type { TitleSettings } from "@/lib/types"
import { getGlobalSettings, updateTitleSettings } from "@/lib/api"

const DEFAULT_GLOBAL_SETTINGS: TitleSettings = {
  auto_oval_bubble: true,
  default_padding: "safe",
  default_hyphenation: true,
  font_bubble: "v_CCFaceFront",
  font_thought: "v_CCFaceFront",
  font_sfx: "v_Mighty Zeo 2.0",
  show_sfx: false,
}

export interface UseMangaSettingsReturn {
  globalSettings: TitleSettings
  setGlobalSettings: React.Dispatch<React.SetStateAction<TitleSettings>>
  currentTitleId: number | null
  setCurrentTitleId: (titleId: number) => void
  titleFontSize: number
  setTitleFontSize: React.Dispatch<React.SetStateAction<number>>
  isApplyingChapterFont: boolean
  setIsApplyingChapterFont: React.Dispatch<React.SetStateAction<boolean>>
  handleTitleFontSizeChange: (newSize: number) => Promise<void>
  handleTitleSelected: (titleId: number, defaultFontSize?: number) => void
}

export function useMangaSettings(): UseMangaSettingsReturn {
  // Базовый размер шрифта для текущего тайтла
  const [currentTitleId, setCurrentTitleId] = useState<number | null>(null)
  const [titleFontSize, setTitleFontSize] = useState<number>(14)
  const [isApplyingChapterFont, setIsApplyingChapterFont] = useState(false)

  // Глобальные настройки приложения
  const [globalSettings, setGlobalSettings] = useState<TitleSettings>(DEFAULT_GLOBAL_SETTINGS)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await getGlobalSettings()
        if (res.success && res.settings) {
          setGlobalSettings(res.settings)
        }
      } catch (err) {
        console.warn("Не удалось загрузить глобальные настройки:", err)
      }
    }
    loadSettings()
  }, [])

  const handleTitleFontSizeChange = useCallback(async (newSize: number) => {
    setTitleFontSize(newSize)
    if (currentTitleId) {
      try {
        await updateTitleSettings(currentTitleId, { default_font_size: newSize } as any)
      } catch (err) {
        console.warn("Не удалось сохранить размер шрифта тайтла:", err)
      }
    }
  }, [currentTitleId])

  const handleTitleSelected = useCallback((titleId: number, defaultFontSize?: number) => {
    setCurrentTitleId(titleId)
    if (defaultFontSize) {
      setTitleFontSize(defaultFontSize)
    }
  }, [])

  return {
    globalSettings,
    setGlobalSettings,
    currentTitleId,
    setCurrentTitleId,
    titleFontSize,
    setTitleFontSize,
    isApplyingChapterFont,
    setIsApplyingChapterFont,
    handleTitleFontSizeChange,
    handleTitleSelected,
  }
}

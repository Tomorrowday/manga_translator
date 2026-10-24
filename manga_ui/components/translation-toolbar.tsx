// manga_ui/components/translation-toolbar.tsx
/**
 * Контракт панели действий со страницей (Detect, OCR, Clean, Translate, Typeset).
 * Реализация: manga_ui/components/translation-toolbar_impl.tsx
 * Зависимости реализации: react, lucide-react (Zap, Wand2, ScanText, PlayCircle, Sparkles, Eye, RotateCcw)
 */

export interface TranslationToolbarProps {
  hasCurrentPage: boolean
  hasBlocks: boolean
  hasCleanScan: boolean
  isFullAuto: boolean
  isDetecting: boolean
  isOcrRunning: boolean
  isBatchTranslating: boolean
  isCleaning: boolean
  isRevertingClean: boolean
  showTypeset: boolean
  onFullAuto: () => void
  onAutoDetect: () => void
  onOcrAllBlocks: () => void
  onTranslateAll: () => void
  onCleanPage: (mode?: "auto" | "lama" | "white") => void
  onRevertClean: () => void
  onToggleTypeset: () => void
}

export { TranslationToolbar } from "./translation-toolbar_impl"
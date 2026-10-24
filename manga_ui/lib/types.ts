// manga_ui/lib/types.ts

export type BlockStatus = "new" | "ocr-done" | "translated"

export type PageStatus = "raw" | "new" | "detected" | "translated" | "cleaned" | "done"

export type BlockShape = "rect" | "ellipse"

export type PaddingMode = "safe" | "fit"

export type TextColor = "black" | "white"

export interface TextBlock {
  id: string
  class_id?: number // 0: Bubble (Речь), 1: Thought (Мысли), 2: Free Text / SFX (Арт)
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  imageCrop?: string
  japText: string
  rusText: string
  speaker?: string
  orderIndex?: number
  status: BlockStatus
  fontSize?: number
  isBold?: boolean
  isItalic?: boolean
  isUppercase?: boolean
  hasStroke?: boolean
  textColor?: TextColor
  fontFamily?: string
  shape?: BlockShape
  paddingMode?: PaddingMode
  minHyphens?: boolean
}

export interface PageItem {
  id: number
  chapter_id: number
  title_id?: number
  page_number: number
  file_path: string
  clean_path?: string
  status: PageStatus
}

export interface ChapterItem {
  id: number
  title_id: number
  volume_number: string
  chapter_number: string
  folder_path: string
  pages: PageItem[]
}

export interface TitleSettings {
  description?: string
  default_font_size?: number
  detector_model?: string
  clean_model?: string
  detect_conf?: number
  auto_oval_bubble?: boolean
  default_padding?: PaddingMode
  default_hyphenation?: boolean
  font_bubble?: string
  font_thought?: string
  font_sfx?: string
  lama_downscale?: boolean
}

export interface TitleProject extends TitleSettings {
  id: number
  name: string
  folder_path: string
  created_at: string
}

export interface ProjectTree extends TitleProject {
  chapters: ChapterItem[]
  available_detectors?: Record<string, string>
  available_cleaners?: Record<string, string>
}

export interface GlossaryItem {
  id: number
  title_id: number
  jap_word: string
  rus_word: string
  context: string
}

export interface ProjectStats {
  total_chapters: number
  total_pages: number
  pages_raw: number
  pages_detected: number
  pages_translated: number
  pages_cleaned: number
  pages_done: number
  total_blocks: number
  translated_blocks: number
  total_glossary: number
}
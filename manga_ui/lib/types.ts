// manga_ui/lib/types.ts

export type BlockStatus = "new" | "ocr-done" | "translated"

export type PageStatus = "raw" | "new" | "detected" | "translated" | "cleaned" | "done"

export type BlockShape = "rect" | "ellipse"

export type PaddingMode = "safe" | "fit"

export type TextColor = "black" | "white"

export interface TextBlock {
  id: string
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

export interface TitleProject {
  id: number
  name: string
  folder_path: string
  description?: string
  default_font_size?: number
  detector_model?: string
  created_at: string
}

export interface ProjectTree extends TitleProject {
  chapters: ChapterItem[]
  available_detectors?: Record<string, string>
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
export type BlockStatus = "new" | "ocr-done" | "translated"

export interface TextBlock {
  id: string
  x: number
  y: number
  width: number
  height: number
  imageCrop?: string
  cropBlob?: Blob | null
  japText: string
  rusText: string
  speaker?: string       // Имя говорящего (например, "Дэндзи", "Макима")
  orderIndex?: number    // Номер очереди реплики (1, 2, 3...)
  status: BlockStatus
  // Параметры тайпсеттинга:
  fontSize?: number
  isBold?: boolean
  isItalic?: boolean
  isUppercase?: boolean
  hasStroke?: boolean
  fontFamily?: string
}

export interface PageItem {
  id: number
  chapter_id: number
  page_number: number
  file_path: string
  clean_path?: string
  status: "new" | "in_progress" | "done"
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
  created_at: string
}
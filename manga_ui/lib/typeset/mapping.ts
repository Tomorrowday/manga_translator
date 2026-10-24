// manga_ui/lib/typeset/mapping.ts
/**
 * Контракт преобразования моделей данных БД в UI, компаратора манги и алгоритма вклинивания баблов.
 * Реализация: manga_ui/lib/typeset/mapping_impl.ts
 * Зависимости реализации: manga_ui/lib/types (TextBlock, BlockShape, PaddingMode)
 */

export interface BoxGeometry {
  x: number
  y: number
  width?: number
  height?: number
}

export {
  compareMangaBlocks,
  findMangaInsertionIndex,
  insertBlockInMangaOrder,
  sortBlocksMangaOrder,
  mapDbBlockToTextBlock,
} from "./mapping_impl"
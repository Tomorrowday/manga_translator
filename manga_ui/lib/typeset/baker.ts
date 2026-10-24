// manga_ui/lib/typeset/baker.ts
/**
 * Контракт рендеринга и запекания тайпсета на Canvas (кроп, шрифты, обводка, Blob).
 * Реализация: manga_ui/lib/typeset/baker_impl.ts
 * Зависимости реализации: manga_ui/lib/typeset/layout, manga_ui/lib/types, HTMLCanvasElement, document.fonts
 */

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export {
  loadImage,
  cropRegion,
  bakePageBlob,
} from "./baker_impl"
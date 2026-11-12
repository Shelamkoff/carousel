import type { CarouselLayout, CarouselLayoutSlot } from './renderTypes.js'
import type { LoopEngine } from './LoopEngine.js'
import type { SlideData } from './types.js'
import type { CarouselGeometryDefinition, CarouselNavigationGeometry } from './navigationTypes.js'

export interface TrackLayout {
  slidesPerView: number
  logicalSlidesPerView?: number
  visibleSlides?: number
  geometry?: CarouselGeometryDefinition
  gap: number
  loop?: boolean
  ariaLabel?: string
  orientation?: 'horizontal' | 'vertical'
  viewportHeight?: number
  layout?: CarouselLayout
  expandRatio?: number
  expandPeek?: number
  keys?: object[]
}

export class TrackRenderer {
  get revision(): number
  onLayoutError(callback: (name: string, error: Error) => void): void
  onGeometryError(callback: (name: string, error: Error) => void): void
  getNavigationGeometry(): CarouselNavigationGeometry | null
  get isMeasuringGeometry(): boolean
  renderPosition(position: number, engine: LoopEngine | null): boolean
  getRenderSlots(position: number, engine: LoopEngine | null): Array<CarouselLayoutSlot & { element: HTMLElement }>
  build(container: HTMLElement, slides: SlideData[], layout: TrackLayout): { root: HTMLElement; viewport: HTMLElement; track: HTMLElement }
  onResize(callback: (previousSlideSize: number) => void): void
  onRenderError(callback: (index: number, error: Error) => void): void
  renderSlide(trackIndex: number, slide: SlideData): boolean
  /** True when the operation completed without being superseded; content errors use onRenderError. */
  updateSlide(index: number, slide: SlideData, options?: { refreshContent?: boolean }): boolean
  updateLayout(slidesPerView: number, gap: number): void
  refreshLayout(): void
  refreshCopies(): boolean
  get viewportSize(): number
  get slideSize(): number
  get viewportWidth(): number
  get slideWidth(): number
  get gap(): number
  get slidesPerView(): number
  setPosition(offset: number): void
  stopAnimation(): void
  rebuild(slides: SlideData[], layout: TrackLayout, refreshContent?: boolean | Set<object>): void
  getRoot(): HTMLElement | null
  getViewport(): HTMLElement | null
  getTrack(): HTMLElement | null
  getSlideElements(): HTMLElement[]
  getPositionElements(): HTMLElement[]
  getSlideElement(index: number): HTMLElement | null
  destroy(): void
}

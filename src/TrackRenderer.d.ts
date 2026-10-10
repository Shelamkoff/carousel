import type { SlideData } from './types.js'

export class TrackRenderer {
  build(container: HTMLElement, slides: SlideData[], layout: { slidesPerView: number; gap: number; loop?: boolean }): { root: HTMLElement; viewport: HTMLElement; track: HTMLElement }
  onResize(callback: (previousSlideWidth: number) => void): void
  onRenderError(callback: (index: number, error: Error) => void): void
  renderSlide(trackIndex: number, slide: SlideData): boolean
  updateLayout(slidesPerView: number, gap: number): void
  refreshLayout(): void
  get slideWidth(): number
  get gap(): number
  get slidesPerView(): number
  setPosition(offset: number): void
  animateTo(targetOffset: number, duration: number, onComplete?: () => void): void
  stopAnimation(): void
  rebuild(slides: SlideData[], layout: { slidesPerView: number; gap: number; loop?: boolean }): void
  getRoot(): HTMLElement | null
  getViewport(): HTMLElement | null
  getTrack(): HTMLElement | null
  getSlideElements(): HTMLElement[]
  getPositionElements(): HTMLElement[]
  getSlideElement(index: number): HTMLElement | null
  destroy(): void
}

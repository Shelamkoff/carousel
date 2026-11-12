import type { CarouselRenderState } from './renderTypes.js'
import type { SlideData, SlidePatch, CarouselOptions, CarouselUpdateOptions, CarouselPlugin, CarouselEventMap } from './types.js'

type Handler<Args extends unknown[]> = (...args: Args) => void

export class Carousel {
  constructor(container: HTMLElement | string, slides: readonly SlideData[], options?: Partial<CarouselOptions>)
  use(plugin: CarouselPlugin): this
  unuse(name: string): boolean
  getPlugin(name: string): CarouselPlugin | undefined
  next(): void
  prev(): void
  goTo(index: number): void
  getIndex(): number
  getRealIndex(): number
  getSlide(index?: number): SlideData | null
  getSlides(): SlideData[]
  getSlideCount(): number
  getSlideElement(index?: number): HTMLElement | null
  getSlideElements(): HTMLElement[]
  getRenderState(): CarouselRenderState | null
  updateSlide(index: number, patch: SlidePatch): void
  moveSlide(from: number, to: number): void
  setSlides(slides: readonly SlideData[]): void
  refresh(index?: number): void
  addSlide(slide: SlideData, index?: number): void
  removeSlide(index: number): void
  update(options: Partial<CarouselUpdateOptions>): void
  on<Event extends keyof CarouselEventMap>(event: Event, handler: Handler<CarouselEventMap[Event]>): () => void
  off<Event extends keyof CarouselEventMap>(event: Event, handler: Handler<CarouselEventMap[Event]>): void
  once<Event extends keyof CarouselEventMap>(event: Event, handler: Handler<CarouselEventMap[Event]>): () => void
  destroy(): void
}

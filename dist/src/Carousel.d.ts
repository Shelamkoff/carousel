import type { SlideData, CarouselOptions, CarouselUpdateOptions, CarouselPlugin, CarouselEventMap } from './types.js'

type Handler<Args extends unknown[]> = (...args: Args) => void

export class Carousel {
  constructor(container: HTMLElement | string, slides: SlideData[], options?: Partial<CarouselOptions>)
  use(plugin: CarouselPlugin): this
  getPlugin(name: string): CarouselPlugin | undefined
  next(): void
  prev(): void
  goTo(index: number): void
  getIndex(): number
  getRealIndex(): number
  getSlide(index?: number): SlideData | null
  getSlides(): SlideData[]
  addSlide(slide: SlideData, index?: number): void
  removeSlide(index: number): void
  update(options: Partial<CarouselUpdateOptions>): void
  on<Event extends keyof CarouselEventMap>(event: Event, handler: Handler<CarouselEventMap[Event]>): () => void
  off<Event extends keyof CarouselEventMap>(event: Event, handler: Handler<CarouselEventMap[Event]>): void
  once<Event extends keyof CarouselEventMap>(event: Event, handler: Handler<CarouselEventMap[Event]>): () => void
  destroy(): void
}

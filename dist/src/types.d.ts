/* ── Slide ── */

export interface SlideData {
  content: string | HTMLElement | (() => HTMLElement)
  thumb?: string
  lazy?: boolean
  meta?: Record<string, unknown>
}

/* ── Transition ── */

export type CarouselTransition = 'slide' | 'fade'

/* ── Plugin system ── */

export interface PluginContext {
  // Events
  on<Event extends CarouselEventName>(event: Event, handler: (...args: CarouselEventMap[Event]) => void): () => void
  once<Event extends CarouselEventName>(event: Event, handler: (...args: CarouselEventMap[Event]) => void): () => void
  emit<Event extends CarouselEventName>(event: Event, ...args: CarouselEventMap[Event]): void

  // Navigation
  next(): void
  prev(): void
  goTo(index: number): void
  goToAfterDrag(index: number, fromIndex: number, direction?: 1 | -1, startPosition?: number): void
  snapBack(index?: number): void

  // Read-only state
  getIndex(): number
  getRealIndex(): number
  getSlide(index?: number): SlideData | null
  getSlides(): SlideData[]
  getSlideCount(): number
  getSlidesPerView(): number
  getSlidesPerScroll(): number
  isLoop(): boolean

  // Resolved options (reflects current breakpoint)
  options: Readonly<CarouselOptions>

  // Position API (for swipe plugin)
  stopAnimation(): void
  getPosition(): number
  setPosition(pos: number): void
  setPositionDrag(pos: number): void
  getStep(): number
  getLoopEngine(): import('./LoopEngine.js').LoopEngine | null

  // DOM access (live getters)
  getRoot(): HTMLElement | null
  getViewport(): HTMLElement | null
  getTrack(): HTMLElement | null
  getSlideElements(): HTMLElement[]
  getVisualElements(): HTMLElement[]
  getSlideElement(index: number): HTMLElement | null
  renderSlide(index: number): boolean
  refreshLayout(): void
}

export interface CarouselPlugin {
  name: string
  install(context: PluginContext): void
  destroy?(): void
  [key: string]: unknown
}

/* ── Options ── */

export interface CarouselOptions {
  slidesPerView?: number
  slidesPerScroll?: number | 'auto'
  gap?: number
  transition?: CarouselTransition
  transitionDuration?: number
  loop?: boolean
  startIndex?: number
  ariaLabel?: string
  breakpoints?: Record<number, Partial<CarouselResponsiveOptions>>
  plugins?: CarouselPlugin[]
}

export type CarouselResponsiveOptions = Omit<CarouselOptions, 'breakpoints' | 'plugins' | 'startIndex'>
export type CarouselUpdateOptions = Omit<CarouselOptions, 'plugins' | 'startIndex'>

/* ── Events ── */

export interface CarouselEventMap {
  'slide:beforeChange': [payload: { fromIndex: number; toIndex: number }]
  'slide:change': [payload: { index: number; prevIndex: number; slide: SlideData }]
  'transition:start': [payload: { fromIndex: number; toIndex: number }]
  'transition:end': [payload: { index: number }]
  'resize': [payload: { slidesPerView: number }]
  'autoplay:start': []
  'autoplay:stop': []
  'slide:lazyload': [payload: { index: number; element: HTMLElement }]
  'slide:error': [payload: { index: number; error: Error }]
  'destroy': []
}

export type CarouselEventName = keyof CarouselEventMap

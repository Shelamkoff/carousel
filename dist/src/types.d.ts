import type { CarouselLayout, CarouselRenderState } from './renderTypes.js'
import type { CarouselGeometryDefinition, CarouselNavigationGeometry } from './navigationTypes.js'
import type { CarouselSurfaceTransitionDefinition } from './transitionTypes.js'

/* ── Slide ── */

export interface SlideContentInstance {
  readonly element: HTMLElement
  /** Release external resources exactly once when this content owner is retired. */
  destroy?(): void
}

export type SlideContentFactory = () => HTMLElement | SlideContentInstance
export type SlideContent = string | HTMLElement | SlideContentFactory

export interface SlideData {
  /** Stable, unique collection identity for immutable reconciliation. */
  id?: string | number
  content: SlideContent
  thumb?: string
  lazy?: boolean
  meta?: Record<string, unknown>
}

export type SlidePatch = Partial<Omit<SlideData, 'id'>>

/* ── Transition ── */

export type CarouselTransitionName =
  | 'slide' | 'fade' | 'stairs' | 'stairs-horizontal' | 'pixel' | 'curtain'
  | 'diamond-wipe' | 'directional-wipe' | 'clock-wipe' | 'aperture-wipe'
  | 'polka-dots' | 'grid-flip' | 'doorway' | 'water-drop'

export interface CarouselTransitionContext {
  /** Owned, inert overlay. Add decorative content here, without moving slides. */
  readonly container: HTMLElement
  /** Actual navigation direction, including wrap-around. */
  readonly direction: 1 | -1
}

export interface CarouselTransitionInstance {
  /** 0: clear; 0.5: fully covered; 1: clear. Called synchronously by Carousel. */
  render(progress: number): void
  /** Release external resources; the container is removed automatically. */
  destroy?(): void
}

export interface CarouselTransitionDefinition {
  readonly kind?: 'cover'
  readonly name: string
  /** Return a fresh synchronous renderer for each navigation. */
  create(context: CarouselTransitionContext): CarouselTransitionInstance
}

export type CarouselTransition = CarouselTransitionName | CarouselTransitionDefinition | CarouselSurfaceTransitionDefinition

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

  // Collection commands, revoked when this plugin is removed.
  addSlide(slide: SlideData, index?: number): void
  removeSlide(index: number): void
  updateSlide(index: number, patch: SlidePatch): void
  moveSlide(from: number, to: number): void
  setSlides(slides: readonly SlideData[]): void
  refresh(index?: number): void

  // Read-only state
  getRenderState(): CarouselRenderState | null
  getNavigationGeometry(): CarouselNavigationGeometry | null
  /** Resolve a logical next/previous page through the current navigation model. */
  getNavigationTarget(direction: 1 | -1, fromIndex?: number): number
  getPageTargets(anchorIndex?: number): number[]
  getIndex(): number
  getRealIndex(): number
  getSlide(index?: number): SlideData | null
  getSlides(): SlideData[]
  getSlideCount(): number
  getSlidesPerView(): number
  getSlidesPerScroll(): number
  isLoop(): boolean
  /** Installed plugin lookup; optional plugins may not be present yet. */
  getPlugin(name: string): CarouselPlugin | undefined

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
  /** Synchronous setup. Start asynchronous work separately and cancel it in destroy(). */
  install(context: PluginContext): void
  /** Synchronous cleanup, including after a partially failed install(). */
  destroy?(): void
  [key: string]: unknown
}

/* ── Options ── */

export interface CarouselOptions {
  slidesPerView?: number
  slidesPerScroll?: number | 'auto'
  orientation?: 'horizontal' | 'vertical'
  /** 'expand' grows the active card and animates neighboring previews. */
  layout?: CarouselLayout
  /** Physical slide sizes and snap points; visual layout remains independent. */
  geometry?: CarouselGeometryDefinition
  /** Number of compact-card equivalents visible in expand mode. Default 2.5. */
  expandVisible?: number
  /** Active card size / compact card size. Default 2.5. */
  expandRatio?: number
  /** Leading peek area in CSS pixels; capped at 25% of viewport. Default 32. */
  expandPeek?: number
  /** Vertical viewport height in CSS pixels. Omit to use --carousel-vertical-height. */
  viewportHeight?: number
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

export interface AutoplayState {
  /** False after the autoplay plugin is destroyed. */
  readonly available: boolean
  /** Whether automatic playback has been requested. */
  readonly active: boolean
  /** Playback is suspended by a transition, hover, focus, pointer or hidden page. */
  readonly paused: boolean
  /** The display interval is currently counting down. */
  readonly running: boolean
  readonly interval: number
  readonly remaining: number
  /** Elapsed fraction of the display interval, clamped to 0…1. */
  readonly progress: number
}

export interface CarouselEventMap {
  'render': [state: CarouselRenderState]
  /** Omitted scope means a full reset; indices target retained logical slides and their copies. */
  'render:reset': [scope?: { readonly indices: readonly number[] }]
  'layout:error': [payload: { name: string; error: Error }]
  'geometry:error': [payload: { name: string; error: Error }]
  'effect:error': [payload: { name: string; error: Error }]
  'slides:change': [payload: {
    type: 'add' | 'remove' | 'update' | 'move' | 'set' | 'refresh'
    previousCount: number
    count: number
    index: number
    /** Point updates identify the affected logical slide and changed fields. */
    updated?: readonly number[]
    fields?: readonly ('content' | 'lazy' | 'meta' | 'thumb')[]
  }]
  'slide:beforeChange': [payload: { fromIndex: number; toIndex: number }]
  'slide:change': [payload: { index: number; prevIndex: number; slide: SlideData }]
  'transition:start': [payload: { fromIndex: number; toIndex: number }]
  'transition:end': [payload: { index: number }]
  /** Coalesced microtask after navigation, snapback or cancellation settles idle. */
  'motion:idle': [payload: { index: number; position: number; reason: 'complete' | 'cancel' }]
  'transition:error': [payload: { name: string; error: Error }]
  'resize': [payload: { slidesPerView: number }]
  'autoplay:start': []
  'autoplay:stop': []
  'autoplay:state': [payload: AutoplayState]
  'slide:lazyload': [payload: { index: number; element: HTMLElement }]
  'slide:error': [payload: { index: number; error: Error }]
  'destroy': []
}

export type CarouselEventName = keyof CarouselEventMap

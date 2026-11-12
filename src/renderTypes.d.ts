/** Canonical main-axis geometry. Layouts receive no DOM nodes. */
export interface CarouselLayoutSlot {
  readonly index: number
  readonly copy: number
  readonly isCopy: boolean
  readonly offset: number
  readonly size: number
  /** Signed distance from focus in logical slide steps. */
  readonly progress: number
}

export interface CarouselLayoutContext {
  readonly position: number
  /** Continuous logical position interpolated between physical snap points. */
  readonly logicalPosition: number
  readonly step: number
  readonly viewportSize: number
  readonly gap: number
  readonly count: number
  readonly loop: boolean
  readonly orientation: 'horizontal' | 'vertical'
  readonly slides: readonly CarouselLayoutSlot[]
}

export interface CarouselSlideGeometry {
  readonly offset: number
  readonly size: number
  /** Override visual focus independently of canonical navigation. */
  readonly progress?: number
}

export interface CarouselLayoutDefinition {
  readonly name: string
  /** Minimum visual coverage for short loops, independent of logical page size. */
  readonly visibleSlides?: number
  /** Synchronous, ordered geometry for every visual slot, including inert copies. */
  render(context: CarouselLayoutContext): readonly CarouselSlideGeometry[]
}

export type CarouselLayout = 'standard' | 'expand' | CarouselLayoutDefinition

export interface CarouselRenderSlide extends CarouselLayoutSlot {
  readonly element: HTMLElement
  /** max(0, 1 - abs(progress)). */
  readonly focus: number
  /** Fraction intersecting the viewport; not a paint/occlusion measurement. */
  readonly visible: number
  readonly hidden?: boolean
}

export interface CarouselRenderState {
  readonly position: number
  readonly step: number
  readonly viewportSize: number
  readonly orientation: 'horizontal' | 'vertical'
  readonly index: number
  readonly selectedIndex: number
  readonly fromIndex: number
  readonly direction: -1 | 0 | 1
  readonly phase: 'idle' | 'drag' | 'animation'
  /** Linear core animation progress; null outside an animation. */
  readonly transitionProgress: number | null
  readonly revision: number
  readonly reducedMotion: boolean
  readonly slides: readonly CarouselRenderSlide[]
}

export interface SlideEffectContext {
  readonly root: HTMLElement
  readonly viewport: HTMLElement
  /** Managed inline CSS. null releases this effect's ownership of a property.
   * Core positioning elements accept only CSS custom properties.
   * Descendants accept other properties; all owned styles restore on teardown. */
  setStyle(element: HTMLElement | null, property: string, value: string | null): void
}

export interface SlideEffectInstance {
  /** Runs synchronously on the shared core frame, including drag and resize. */
  render(state: CarouselRenderState): void
  destroy?(): void
}

export interface SlideEffectDefinition {
  readonly name: string
  create(context: SlideEffectContext): SlideEffectInstance
}

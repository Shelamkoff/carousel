export interface CarouselSurfaceTransitionContext {
  /** Owned inert layer; the live track remains attached and is temporarily hidden. */
  readonly container: HTMLElement
  /** Fixed decorative DOM snapshots of the outgoing and incoming logical slides. */
  readonly from: HTMLElement
  readonly to: HTMLElement
  readonly fromIndex: number
  readonly toIndex: number
  readonly direction: 1 | -1
  readonly orientation: 'horizontal' | 'vertical'
  readonly viewportSize: number
}

export interface CarouselSurfaceTransitionInstance {
  /** Synchronous progress from 0 to 1; no mandatory opaque midpoint. */
  render(progress: number): void
  /** Release external resources; surfaces and temporary track masking belong to core. */
  destroy?(): void
}

export interface CarouselSurfaceTransitionDefinition {
  readonly kind: 'surfaces'
  readonly name: string
  /** Logical destination commit boundary, inclusive 0..1; defaults to 1. */
  readonly commitAt?: number
  createSurfaces(context: CarouselSurfaceTransitionContext): CarouselSurfaceTransitionInstance
}

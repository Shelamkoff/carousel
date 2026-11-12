import type { AutoScrollState, CarouselPlugin } from '../types.js'

export interface AutoScrollOptions {
  /** CSS pixels/second; positive and finite. Default 40. */
  speed?: number
  /** Forward moves content left/up; backward moves it right/down. */
  direction?: 'forward' | 'backward'
  autoStart?: boolean
  pauseOnHover?: boolean
  pauseOnFocus?: boolean
  /** Permanently stop on navigation/pointer interaction. Default false. */
  pauseOnInteraction?: boolean
  /** Suspend while prefers-reduced-motion: reduce matches. Default true. */
  respectReducedMotion?: boolean
}

export interface AutoScrollPlugin extends CarouselPlugin {
  start(): void
  stop(): void
  toggle(): void
  isActive(): boolean
  getState(): Readonly<AutoScrollState>
  /** Changes velocity without snapping to a slide. */
  update(options: Pick<AutoScrollOptions, 'speed' | 'direction'>): void
}

export function createAutoScroll(options?: AutoScrollOptions): AutoScrollPlugin

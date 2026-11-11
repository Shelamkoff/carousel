import type { AutoplayState, CarouselPlugin } from '../types.js'

export interface AutoplayPlugin extends CarouselPlugin {
  start(): void
  stop(): void
  toggle(): void
  isActive(): boolean
  getState(): Readonly<AutoplayState>
}

export function createAutoplay(options?: {
  /** Display time in milliseconds, greater than 0 and at most 2147483647. */
  interval?: number
  pauseOnHover?: boolean
  pauseOnInteraction?: boolean
  pauseOnFocus?: boolean
}): AutoplayPlugin

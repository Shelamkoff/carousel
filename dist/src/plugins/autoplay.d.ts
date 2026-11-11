import type { CarouselPlugin } from '../types.js'

export interface AutoplayPlugin extends CarouselPlugin {
  start(): void
  stop(): void
  toggle(): void
  isActive(): boolean
}

export function createAutoplay(options?: {
  interval?: number
  pauseOnHover?: boolean
  pauseOnInteraction?: boolean
}): AutoplayPlugin

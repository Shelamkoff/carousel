import type { CarouselPlugin } from '../types.js'

export function createSwipe(options?: {
  threshold?: number
  mouse?: boolean
  resistance?: number
}): CarouselPlugin

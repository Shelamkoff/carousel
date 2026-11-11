import type { CarouselPlugin } from '../types.js'

export function createLazyLoad(options?: {
  rootMargin?: string
  threshold?: number
  preload?: number
}): CarouselPlugin

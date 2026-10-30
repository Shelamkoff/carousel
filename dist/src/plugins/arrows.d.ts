import type { CarouselPlugin } from '../types.js'

export function createArrows(options?: {
  prevHTML?: string
  nextHTML?: string
  hideOnEdge?: boolean
}): CarouselPlugin

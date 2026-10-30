import type { CarouselPlugin } from '../types.js'

export function createThumbnails(options?: {
  width?: number
  height?: number
  position?: 'bottom' | 'left' | 'right'
}): CarouselPlugin

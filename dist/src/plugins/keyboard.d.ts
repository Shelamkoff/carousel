import type { CarouselPlugin } from '../types.js'

export function createKeyboard(options?: {
  scope?: 'document' | 'container'
}): CarouselPlugin

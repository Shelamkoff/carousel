import type { CarouselPlugin } from '../types.js'

export interface FocusEffectOptions {
  /** Inactive scale, from 0 to 1. Default .9. */
  scale?: number
  /** Inactive opacity, from 0 to 1. Default .6. */
  opacity?: number
  /** Cross-axis displacement in CSS pixels. Default 0. */
  offset?: number
  /** Targets within each slide. Defaults to direct children. */
  selector?: string
  /** Effect name, useful for composing multiple independently removable effects. */
  name?: string
}
export function createFocusEffect(options?: FocusEffectOptions): CarouselPlugin

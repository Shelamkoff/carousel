import type { CarouselPlugin } from '../types.js'

export interface ControlsOptions {
  /** Show when an autoplay plugin is installed. Defaults to true. */
  playPause?: boolean
  /** A circle, a bar, or no time indicator. Defaults to 'circle'. */
  progress?: 'circle' | 'bar' | false
  /** Selected logical slide / total source slides. Defaults to true. */
  counter?: boolean
  position?: 'below' | 'overlay'
  labels?: {
    play?: string
    pause?: string
    progress?: string
    counter?: string
    controls?: string
  }
  /** Plain text, never interpreted as HTML. The empty carousel is 0 / 0. */
  formatCounter?: (current: number, total: number) => string
}

export interface ControlsPlugin extends CarouselPlugin {
  /** Update the presentation without recreating the carousel. */
  update(options: ControlsOptions): void
}

export function createControls(options?: ControlsOptions): ControlsPlugin

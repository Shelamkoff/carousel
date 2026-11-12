import type { CarouselSurfaceTransitionDefinition } from '../transitionTypes.js'

export interface SurfaceCrossfadeOptions {
  name?: string
  commitAt?: number
}

export interface SurfacePageTurnOptions extends SurfaceCrossfadeOptions {
  /** CSS perspective distance in pixels; defaults to 1200. */
  perspective?: number
}

export function createSurfaceCrossfade(options?: SurfaceCrossfadeOptions): CarouselSurfaceTransitionDefinition
export function createSurfacePageTurn(options?: SurfacePageTurnOptions): CarouselSurfaceTransitionDefinition

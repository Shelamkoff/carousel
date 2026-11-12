import type { NavigationGeometry } from './NavigationGeometry.js'

export class LoopEngine {
  constructor(count: number, step: number)
  constructor(geometry: NavigationGeometry)
  update(count: number, step: number): void
  update(geometry: NavigationGeometry): void
  get step(): number
  get loopLength(): number
  get count(): number
  normalize(pos: number): number
  toIndex(pos: number): number
  shortestDelta(currentPos: number, targetIndex: number): number
  directedDelta(currentPos: number, targetIndex: number, direction: 1 | -1): number
  getSlots(slides: HTMLElement[], position: number, viewportWidth?: number, slideWidth?: number): Array<{
    slide: HTMLElement; logical: number; copy: number; x: number
  }>
  positionSlides(slides: HTMLElement[], position: number, viewportWidth?: number, slideWidth?: number, orientation?: 'horizontal' | 'vertical'): void
}

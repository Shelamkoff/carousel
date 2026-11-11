export class LoopEngine {
  constructor(count: number, step: number)
  update(count: number, step: number): void
  get step(): number
  get loopLength(): number
  get count(): number
  normalize(pos: number): number
  toIndex(pos: number): number
  shortestDelta(currentPos: number, targetIndex: number): number
  directedDelta(currentPos: number, targetIndex: number, direction: 1 | -1): number
  positionSlides(slides: HTMLElement[], position: number, viewportWidth?: number, slideWidth?: number): void
}

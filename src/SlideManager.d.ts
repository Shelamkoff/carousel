import type { SlideData, SlidePatch } from './types.js'

export class SlideManager {
  constructor(slides: readonly SlideData[])
  getSlides(): SlideData[]
  getSlide(index: number): SlideData | null
  getSlideCount(): number
  addSlide(slide: SlideData, index?: number): void
  removeSlide(index: number): void
  getKeys(): object[]
  getKey(index: number): object | undefined
  indexOfKey(key: object | undefined): number
  assertIndex(index: number): void
  setSlides(slides: readonly SlideData[]): void
  updateSlide(index: number, patch: SlidePatch): void
  moveSlide(from: number, to: number): boolean
  clear(): void
}

import type { SlideData } from './types.js'

export class SlideManager {
  constructor(slides: SlideData[])
  getSlides(): SlideData[]
  getSlide(index: number): SlideData | null
  getSlideCount(): number
  addSlide(slide: SlideData, index?: number): void
  removeSlide(index: number): void
  clear(): void
}

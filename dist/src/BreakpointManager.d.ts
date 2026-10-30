import type { CarouselOptions, CarouselResponsiveOptions } from './types.js'

export class BreakpointManager {
  constructor(baseOptions: CarouselOptions, breakpoints?: Record<number, Partial<CarouselResponsiveOptions>>)
  onChange(callback: () => void): void
  resolve(): CarouselOptions
  updateBase(options: CarouselOptions): void
  destroy(): void
}

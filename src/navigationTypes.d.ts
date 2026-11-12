/** Ordered measurement inputs. Content and DOM nodes are not included. */
export interface CarouselGeometrySlideDescriptor {
  readonly index: number
  readonly id?: string | number
  /** A shallow frozen copy; nested application values are not recursively frozen. */
  readonly meta?: Readonly<Record<string, unknown>>
}

export interface CarouselGeometryContext {
  readonly viewportSize: number
  readonly count: number
  readonly slidesPerView: number
  readonly gap: number
  readonly orientation: 'horizontal' | 'vertical'
  readonly slides: readonly CarouselGeometrySlideDescriptor[]
}

export interface CarouselGeometrySlide {
  readonly offset: number
  readonly size: number
}

export interface CarouselGeometryMeasurement {
  readonly slides: readonly CarouselGeometrySlide[]
  /** Defaults to slide offsets. Starts at zero; strictly increases for nonzero geometry. */
  readonly snapPoints?: readonly number[]
  /** Defaults to the greatest slide end plus gap. Contains every slide and snap. */
  readonly loopLength?: number
  /** Defaults to min(lastSnap, max(0, greatestSlideEnd - viewportSize)). */
  readonly maxPosition?: number
}

export interface CarouselGeometryDefinition {
  readonly name: string
  /** Synchronous measurement; invalid output is reported by the carousel. */
  measure(context: CarouselGeometryContext): CarouselGeometryMeasurement
}

export interface CarouselNavigationSlotDescriptor {
  readonly index: number
  readonly copy?: number
}

export interface CarouselNavigationSlot extends CarouselNavigationSlotDescriptor, CarouselGeometrySlide {
  readonly copy: number
  readonly isCopy: boolean
  /** Logical distance for the actual visual instance, including promoted originals. */
  readonly progress: number
}

/** Immutable canonical navigation model, independent of the visual layout or DOM. */
export interface CarouselNavigationGeometry {
  readonly count: number
  /** Canonical uniform fallback; custom geometry may have different physical intervals. */
  readonly step: number
  readonly slideSize: number
  readonly uniform: boolean
  readonly viewportSize: number
  readonly bounds: Readonly<{ min: 0; max: number }>
  readonly maxPosition: number
  readonly lastIndex: number
  readonly loopLength: number
  readonly slides: readonly CarouselGeometrySlide[]
  readonly snapPoints: readonly number[]
  /** Clamps the logical index to a finite destination; loop=true returns the raw snap. */
  indexToPosition(index: number, loop?: boolean): number
  positionToIndex(position: number, loop?: boolean): number
  logicalPosition(position: number, loop?: boolean): number
  normalize(position: number): number
  shortestDelta(position: number, index: number): number
  directedDelta(position: number, index: number, direction: 1 | -1): number
  progress(index: number, position: number, loop?: boolean): number
  getSlots(slides: readonly CarouselNavigationSlotDescriptor[], position: number, loop?: boolean, viewportSize?: number): readonly CarouselNavigationSlot[]
}

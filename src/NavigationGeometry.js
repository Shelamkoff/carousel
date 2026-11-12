import { getLastSlideIndex } from './navigation.js'

const nonnegative = (value, name) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`NavigationGeometry: ${name} must be a non-negative finite number`)
  }
  return value
}

const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`NavigationGeometry: ${name} must be finite`)
  return value
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const modulo = (value, divisor) => {
  const remainder = value % divisor
  return remainder < 0 ? remainder + divisor : remainder || 0
}

function denseArray(value, length, name) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`NavigationGeometry: ${name} must contain ${length} ordered entries`)
  }
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(value, index)) throw new TypeError(`NavigationGeometry: ${name} must not be sparse`)
  }
}

/** Copy only the public measurement inputs; content and DOM nodes are not exposed. */
function snapshotContext(input) {
  if (!record(input)) throw new TypeError('NavigationGeometry: context must be an object')
  const { count, slidesPerView, orientation } = input
  if (!Number.isInteger(count) || count < 0) throw new RangeError('NavigationGeometry: count must be a non-negative integer')
  if (!Number.isFinite(slidesPerView) || slidesPerView <= 0) {
    throw new RangeError('NavigationGeometry: slidesPerView must be positive and finite')
  }
  if (orientation !== 'horizontal' && orientation !== 'vertical') {
    throw new TypeError('NavigationGeometry: orientation must be horizontal or vertical')
  }
  const viewportSize = nonnegative(input.viewportSize, 'viewportSize')
  const gap = nonnegative(input.gap, 'gap')
  denseArray(input.slides, count, 'context.slides')
  const slides = input.slides.map((slide, index) => {
    if (!record(slide) || slide.index !== index) {
      throw new TypeError('NavigationGeometry: slide descriptors must match their ordered index')
    }
    const descriptor = { index }
    if (slide.id !== undefined) {
      if (!((typeof slide.id === 'string' && slide.id.length > 0) || Number.isFinite(slide.id))) {
        throw new TypeError('NavigationGeometry: slide id must be a nonempty string or finite number')
      }
      descriptor.id = slide.id
    }
    if (slide.meta !== undefined) {
      if (!record(slide.meta)) throw new TypeError('NavigationGeometry: slide meta must be an object')
      // Do not freeze application-owned metadata or recursively traverse arbitrary values.
      descriptor.meta = Object.freeze({ ...slide.meta })
    }
    return Object.freeze(descriptor)
  })
  return Object.freeze({ viewportSize, count, slidesPerView, gap, orientation, slides: Object.freeze(slides) })
}

/** First entry greater than or equal to value. The measurements never change. */
function lowerBound(values, value) {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (values[middle] < value) low = middle + 1
    else high = middle
  }
  return low
}

function measureCustom(context, definition) {
  if (!record(definition) || typeof definition.name !== 'string' || definition.name.trim() === '' ||
      typeof definition.measure !== 'function') {
    throw new TypeError('NavigationGeometry: geometry requires a name and synchronous measure(context)')
  }
  const result = definition.measure(context)
  if (result && typeof result.then === 'function') {
    // An accidentally async callback may reject: consume it while reporting the
    // synchronous contract violation to the caller's geometry:error boundary.
    Promise.resolve(result).catch(() => {})
    throw new TypeError('NavigationGeometry: measure(context) must return synchronously')
  }
  if (!record(result)) throw new TypeError('NavigationGeometry: measure(context) must return an object')
  denseArray(result.slides, context.count, 'slides')
  let maxExtent = 0
  let previousOffset = 0
  const slides = result.slides.map((slide, index) => {
    if (!record(slide)) throw new TypeError('NavigationGeometry: each slide must contain offset and size')
    const offset = nonnegative(slide.offset, `slides[${index}].offset`)
    const size = nonnegative(slide.size, `slides[${index}].size`)
    if (offset < previousOffset) throw new RangeError('NavigationGeometry: slide offsets must be ordered')
    previousOffset = offset
    maxExtent = Math.max(maxExtent, nonnegative(offset + size, 'slide extent'))
    return Object.freeze({ offset, size })
  })
  const rawSnaps = result.snapPoints === undefined ? slides.map(slide => slide.offset) : result.snapPoints
  denseArray(rawSnaps, context.count, 'snapPoints')
  const snapPoints = rawSnaps.map((snap, index) => nonnegative(snap, `snapPoints[${index}]`))
  if (context.count > 0 && snapPoints[0] !== 0) throw new RangeError('NavigationGeometry: the first snap point must be zero')
  const lastSnap = snapPoints.at(-1) ?? 0
  const degenerate = maxExtent === 0 && lastSnap === 0
  for (let index = 1; index < snapPoints.length; index++) {
    if (snapPoints[index] < snapPoints[index - 1] || (!degenerate && snapPoints[index] === snapPoints[index - 1])) {
      throw new RangeError('NavigationGeometry: nonzero geometry requires strictly increasing snap points')
    }
  }
  const loopLength = nonnegative(result.loopLength === undefined ? (context.count > 0 ? maxExtent + context.gap : 0) : result.loopLength, 'loopLength')
  if (loopLength < maxExtent || (!degenerate && (loopLength === 0 || lastSnap >= loopLength))) {
    throw new RangeError('NavigationGeometry: loopLength must contain every slide and be greater than the last snap')
  }
  if ((context.count === 0 || (context.count > 1 && degenerate)) && loopLength !== 0) {
    throw new RangeError('NavigationGeometry: empty or repeated-zero geometry requires a zero loopLength')
  }
  const maxPosition = nonnegative(result.maxPosition === undefined ? Math.min(lastSnap, Math.max(0, maxExtent - context.viewportSize)) : result.maxPosition, 'maxPosition')
  if (maxPosition > lastSnap) throw new RangeError('NavigationGeometry: maxPosition must not exceed the last snap point')
  return { slides, snapPoints, loopLength, maxPosition,
    lastIndex: Math.min(Math.max(0, context.count - 1), lowerBound(snapPoints, maxPosition)) }
}

/**
 * Immutable physical navigation measurements. A model is replaced on measurement
 * changes; per-frame operations never call application code or rebuild its arrays.
 */
export class NavigationGeometry {
  #wrapSpans
  #endpointTolerance

  /**
   * @param {import('./navigationTypes.js').CarouselGeometryContext} input
   * @param {import('./navigationTypes.js').CarouselGeometryDefinition} [definition]
   * @param {{ slideSize: number, step: number }} [uniform]
   */
  constructor(input, definition, uniform) {
    const context = snapshotContext(input)
    const { count, viewportSize, slidesPerView, gap } = context
    const slideSize = nonnegative(uniform?.slideSize ?? Math.max(0, (viewportSize - gap * (slidesPerView - 1)) / slidesPerView), 'slideSize')
    const step = nonnegative(uniform?.step ?? slideSize + gap, 'step')
    const custom = definition !== undefined
    const measurement = custom ? measureCustom(context, definition) : {
      slides: Array.from({ length: count }, (_, index) => Object.freeze({ offset: nonnegative(index * step, 'slide offset'), size: slideSize })),
      snapPoints: Array.from({ length: count }, (_, index) => index * step),
      loopLength: nonnegative(count * step, 'loopLength'),
      maxPosition: nonnegative(Math.max(0, count - slidesPerView) * step, 'maxPosition'),
      lastIndex: getLastSlideIndex(count, slidesPerView),
    }
    const { slides, snapPoints, loopLength, maxPosition, lastIndex } = measurement
    this.#wrapSpans = Object.freeze(slides.map((slide, index) => custom ? Math.max(slide.size,
      (slides[index + 1]?.offset ?? loopLength + (slides[0]?.offset ?? 0)) - slide.offset) : step))
    const endStep = custom && lastIndex > 0 ? snapPoints[lastIndex] - snapPoints[lastIndex - 1] : step
    this.#endpointTolerance = Math.min(.001, endStep * 1e-6)
    Object.assign(this, {
      count, step, slideSize, uniform: !custom, viewportSize,
      bounds: Object.freeze({ min: 0, max: maxPosition }), maxPosition, lastIndex, loopLength,
      slides: Object.freeze(slides), snapPoints: Object.freeze(snapPoints),
    })
    Object.freeze(this)
  }

  /** Finite targets include the clipped last page; loop targets use raw snaps. */
  indexToPosition(index, loop = false) {
    if (!Number.isInteger(index)) throw new RangeError('NavigationGeometry: index must be an integer')
    if (this.count === 0) return 0
    const target = Math.max(0, Math.min(loop ? this.count - 1 : this.lastIndex, index))
    const snap = this.snapPoints[target]
    return loop ? snap : Math.min(snap, this.maxPosition)
  }

  /** Closest raw snap in O(log N), with forward ties and the finite end override. */
  positionToIndex(position, loop = false) {
    finite(position, 'position')
    if (this.count === 0 || this.loopLength === 0) return 0
    if (loop) {
      const normalized = this.normalize(position)
      if (this.uniform) return Math.round(normalized / this.step) % this.count
      const after = lowerBound(this.snapPoints, normalized)
      if (after === 0) return 0
      if (after === this.count) {
        return normalized - this.snapPoints[this.count - 1] < this.loopLength - normalized ? this.count - 1 : 0
      }
      return normalized - this.snapPoints[after - 1] < this.snapPoints[after] - normalized ? after - 1 : after
    }
    const lastTarget = this.indexToPosition(this.lastIndex)
    if (position >= lastTarget - this.#endpointTolerance) return this.lastIndex
    if (this.uniform) return Math.max(0, Math.min(this.lastIndex, Math.round(position / this.step)))
    const after = lowerBound(this.snapPoints, position)
    if (after === 0) return 0
    if (after === this.count) return this.lastIndex
    const closest = position - this.snapPoints[after - 1] < this.snapPoints[after] - position ? after - 1 : after
    return Math.min(this.lastIndex, closest)
  }

  /** Continuous index coordinate, interpolated between adjacent physical snaps. */
  logicalPosition(position, loop = false) {
    finite(position, 'position')
    if (this.count === 0 || this.loopLength === 0) return 0
    const value = loop ? this.normalize(position) : position
    if (this.uniform) return value / this.step
    if (this.count === 1) return value / this.loopLength
    const last = this.count - 1
    if (value <= 0) return value / this.snapPoints[1]
    if (value >= this.snapPoints[last]) {
      const span = loop ? this.loopLength - this.snapPoints[last] : this.snapPoints[last] - this.snapPoints[last - 1]
      return last + (value - this.snapPoints[last]) / span
    }
    const after = lowerBound(this.snapPoints, value)
    const before = after - 1
    return before + (value - this.snapPoints[before]) / (this.snapPoints[after] - this.snapPoints[before])
  }

  normalize(position) {
    finite(position, 'position')
    return this.loopLength > 0 ? modulo(position, this.loopLength) : 0
  }

  shortestDelta(position, index) {
    if (this.loopLength <= 0) return 0
    let delta = this.indexToPosition(index, true) - this.normalize(position)
    if (delta > this.loopLength / 2) delta -= this.loopLength
    if (delta <= -this.loopLength / 2) delta += this.loopLength
    return delta
  }

  directedDelta(position, index, direction) {
    if (direction !== 1 && direction !== -1) throw new TypeError('NavigationGeometry: direction must be 1 or -1')
    if (this.loopLength <= 0) return 0
    const delta = this.indexToPosition(index, true) - this.normalize(position)
    return direction === 1
      ? modulo(delta, this.loopLength)
      : -modulo(-delta, this.loopLength)
  }

  /** Signed distance to the closest logical instance; copies use their actual slot. */
  progress(index, position, loop = false) {
    finite(index, 'index')
    let distance = index - this.logicalPosition(position, loop)
    if (loop && this.count > 0 && this.loopLength > 0) {
      distance = modulo(distance, this.count)
      if (distance > this.count / 2) distance -= this.count
    }
    return distance
  }

  /**
   * @param {readonly import('./navigationTypes.js').CarouselNavigationSlotDescriptor[]} descriptors
   * @param {number} position
   * @param {boolean} [loop]
   * @param {number} [viewportSize]
   */
  getSlots(descriptors, position, loop = false, viewportSize = this.viewportSize) {
    finite(position, 'position')
    nonnegative(viewportSize, 'viewportSize')
    if (this.count === 0) return []
    const normalized = loop ? this.normalize(position) : position
    const logicalPosition = this.logicalPosition(position, loop)
    const hasCopies = loop && descriptors.some(descriptor => (descriptor.copy ?? 0) !== 0)
    const slots = descriptors.map(descriptor => {
      const { index } = descriptor
      const copy = descriptor.copy ?? 0
      if (!Number.isInteger(index) || index < 0 || index >= this.count || !Number.isInteger(copy)) {
        throw new RangeError('NavigationGeometry: slots require a valid slide index and integer copy')
      }
      const slide = this.slides[index]
      let cycle = loop ? copy : 0
      let offset = slide.offset + cycle * this.loopLength - normalized
      if (loop && !hasCopies && this.loopLength > 0) {
        const shift = Math.floor((offset + this.#wrapSpans[index]) / this.loopLength)
        offset -= this.loopLength * shift
        cycle -= shift
      }
      return { index, copy, isCopy: copy !== 0, offset, size: slide.size,
        progress: index + cycle * this.count - logicalPosition }
    })
    if (hasCopies && viewportSize > 0) {
      const originalByIndex = new Map()
      const bestByIndex = new Map()
      const overlap = slot => Math.max(0, Math.min(viewportSize, slot.offset + slot.size) - Math.max(0, slot.offset))
      for (const slot of slots) {
        if (slot.copy === 0) originalByIndex.set(slot.index, slot)
        const best = bestByIndex.get(slot.index)
        if (!best || overlap(slot) > overlap(best)) bestByIndex.set(slot.index, slot)
      }
      for (const [index, original] of originalByIndex) {
        const best = bestByIndex.get(index)
        if (best && best !== original && overlap(best) > overlap(original)) {
          ;[original.offset, best.offset] = [best.offset, original.offset]
          ;[original.progress, best.progress] = [best.progress, original.progress]
        }
      }
    }
    return slots
  }
}

/** @returns {NavigationGeometry} */
export function createNavigationGeometry(context, definition, uniform) {
  return new NavigationGeometry(context, definition, uniform)
}

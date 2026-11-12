import { NavigationGeometry, createNavigationGeometry } from './NavigationGeometry.js'

function legacyGeometry(count, step, slideSize = step) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('LoopEngine: count must be a non-negative integer')
  }
  if (!Number.isFinite(step) || step < 0) {
    throw new RangeError('LoopEngine: step must be a non-negative finite number')
  }
  return createNavigationGeometry({
    viewportSize: step, count, slidesPerView: 1, gap: 0, orientation: 'horizontal',
    slides: Array.from({ length: count }, (_, index) => ({ index })),
  }, undefined, { slideSize, step })
}

/**
 * Backward-compatible DOM adapter for the immutable numerical navigation model.
 * Existing count/step consumers keep their signatures and slot return shape.
 */
export class LoopEngine {
  /** @type {NavigationGeometry} */
  #geometry
  #legacy = false
  #slotGeometry = null

  /** @param {number | NavigationGeometry} count @param {number} [step] */
  constructor(count, step) {
    this.update(count, step)
  }

  /** @param {number | NavigationGeometry} count @param {number} [step] */
  update(count, step) {
    const geometry = count instanceof NavigationGeometry ? count : legacyGeometry(count, step)
    this.#legacy = !(count instanceof NavigationGeometry)
    this.#geometry = geometry
    this.#slotGeometry = null
  }

  get step() { return this.#geometry.step }
  get loopLength() { return this.#geometry.loopLength }
  get count() { return this.#geometry.count }

  normalize(position) { return this.#geometry.normalize(position) }
  toIndex(position) { return this.#geometry.positionToIndex(position, true) }
  shortestDelta(position, index) { return this.#geometry.shortestDelta(position, index) }
  directedDelta(position, index, direction) { return this.#geometry.directedDelta(position, index, direction) }

  /**
   * The legacy slideWidth parameter only supplies overlap measurements. Models
   * supplied directly already know each physical slide size, including variable sizes.
   * @param {HTMLElement[]} slides
   * @param {number} position
   * @param {number} [viewportWidth]
   * @param {number} [slideWidth]
   */
  getSlots(slides, position, viewportWidth = 0, slideWidth = 0) {
    if (this.count === 0 || this.loopLength === 0) return []
    let geometry = this.#geometry
    if (this.#legacy && slideWidth > 0 && slideWidth !== geometry.slideSize) {
      if (this.#slotGeometry?.slideSize !== slideWidth) {
        this.#slotGeometry = legacyGeometry(this.count, this.step, slideWidth)
      }
      geometry = this.#slotGeometry
    }
    const descriptors = slides.map((slide, index) => ({
      index: Number(slide.dataset?.index ?? index % this.count),
      copy: Number(slide.dataset?.carouselCopy ?? 0),
    }))
    const viewport = this.#legacy && slideWidth <= 0 ? 0 : viewportWidth
    const slots = geometry.getSlots(descriptors, position, true, viewport)
    return slots.map((slot, index) => ({ slide: slides[index], logical: slot.index, copy: slot.copy, x: slot.offset }))
  }

  positionSlides(slides, position, viewportWidth = 0, slideWidth = 0, orientation = 'horizontal') {
    const slots = this.getSlots(slides, position, viewportWidth, slideWidth)
    for (const { slide, x } of slots) {
      slide.style.transform = orientation === 'vertical'
        ? 'translate3d(0, ' + x + 'px, 0)'
        : 'translate3d(' + x + 'px, 0, 0)'
    }
  }
}

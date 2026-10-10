/**
 * Circular position engine.
 *
 * Positions are measured in slide steps (slide width + gap). Logical indexes
 * never refer to visual copies: a copy is only another rendering of a slide.
 */
export class LoopEngine {
  /** @type {number} */
  #count
  /** @type {number} */
  #step
  /** @type {number} */
  #loopLength

  /** @param {number} count @param {number} step */
  constructor(count, step) {
    this.#validate(count, step)
    this.#count = count
    this.#step = step
    this.#loopLength = count * step
  }

  /** @param {number} count @param {number} step */
  update(count, step) {
    this.#validate(count, step)
    this.#count = count
    this.#step = step
    this.#loopLength = count * step
  }

  get step() { return this.#step }
  get loopLength() { return this.#loopLength }
  get count() { return this.#count }

  /** @param {number} position */
  normalize(position) {
    if (this.#loopLength <= 0) return 0
    return ((position % this.#loopLength) + this.#loopLength) % this.#loopLength
  }

  /** @param {number} position */
  toIndex(position) {
    if (this.#count === 0 || this.#step <= 0) return 0
    return Math.round(this.normalize(position) / this.#step) % this.#count
  }

  /**
   * Shortest route for explicit goTo() calls. Ties are forward by convention.
   * @param {number} currentPosition
   * @param {number} targetIndex
   */
  shortestDelta(currentPosition, targetIndex) {
    if (this.#loopLength <= 0) return 0
    const target = targetIndex * this.#step
    const normalized = this.normalize(currentPosition)
    let delta = target - normalized
    if (delta > this.#loopLength / 2) delta -= this.#loopLength
    if (delta < -this.#loopLength / 2) delta += this.#loopLength
    return delta
  }

  /**
   * Preserve the requested direction for next(), prev() and swipes.
   * The shortest route can otherwise reverse direction for page-sized moves.
   * @param {number} currentPosition
   * @param {number} targetIndex
   * @param {1 | -1} direction
   */
  directedDelta(currentPosition, targetIndex, direction) {
    if (direction !== 1 && direction !== -1) {
      throw new TypeError('LoopEngine: direction must be 1 or -1')
    }
    if (this.#loopLength <= 0) return 0
    const delta = targetIndex * this.#step - this.normalize(currentPosition)
    return direction === 1
      ? ((delta % this.#loopLength) + this.#loopLength) % this.#loopLength
      : -(((-delta % this.#loopLength) + this.#loopLength) % this.#loopLength)
  }

  /**
   * Position logical slides individually; the track never moves.
   *
   * Without copies, a slide wraps only after leaving the viewport on the
   * left, not at the midpoint of the loop. This keeps multi-slide layouts
   * contiguous whenever count > slidesPerView.
   *
   * If the renderer supplies visual copies (data-carousel-copy="1", etc.),
   * position the copies in successive cycles. They fill layouts where the
   * entire loop is shorter than the viewport.
   *
   * @param {HTMLElement[]} slides
   * @param {number} position
   * @param {number} [viewportWidth] — necessary to promote interactive originals over copies
   * @param {number} [slideWidth]
   */
  positionSlides(slides, position, viewportWidth = 0, slideWidth = 0) {
    if (this.#count === 0 || this.#step <= 0) return
    const loopLength = this.#loopLength
    const normalized = this.normalize(position)
    const hasCopies = slides.some(slide => slide.dataset?.carouselCopy !== undefined)

    const slots = slides.map((slide, index) => {
      const logical = Number(slide.dataset?.index ?? index % this.#count)
      const copy = Number(slide.dataset?.carouselCopy ?? 0)
      let x
      if (hasCopies) {
        x = logical * this.#step + copy * loopLength - normalized
      } else {
        x = index * this.#step - normalized
        x -= loopLength * Math.floor((x + this.#step) / loopLength)
      }
      return { slide, logical, copy, x }
    })

    if (hasCopies && viewportWidth > 0 && slideWidth > 0) {
      // Replicas have no application event listeners. Keep the original
      // interactive node at the most visible instance of each logical slide
      // and swap the inert replica into its former position instead.
      const originalByIndex = new Map()
      const bestByIndex = new Map()
      const overlap = x => Math.max(0,
        Math.min(viewportWidth, x + slideWidth) - Math.max(0, x))
      for (const slot of slots) {
        if (slot.copy === 0) originalByIndex.set(slot.logical, slot)
        const best = bestByIndex.get(slot.logical)
        if (!best || overlap(slot.x) > overlap(best.x)) {
          bestByIndex.set(slot.logical, slot)
        }
      }
      for (const [logical, original] of originalByIndex) {
        const best = bestByIndex.get(logical)
        if (best && best !== original && overlap(best.x) > overlap(original.x)) {
          const oldPosition = original.x
          original.x = best.x
          best.x = oldPosition
        }
      }
    }

    for (const { slide, x } of slots) {
      slide.style.transform = 'translate3d(' + x + 'px, 0, 0)'
    }
  }

  /** @param {number} count @param {number} step */
  #validate(count, step) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('LoopEngine: count must be a non-negative integer')
    }
    if (!Number.isFinite(step) || step < 0) {
      throw new RangeError('LoopEngine: step must be a non-negative finite number')
    }
  }
}

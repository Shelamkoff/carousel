/**
 * Position-first loop engine.
 *
 * Each slide gets its FULL position via individual transform.
 * Track transform is NOT used in loop mode.
 * No discrete k*L jumps visible — repositioning only happens off-screen.
 */
export class LoopEngine {
  /** @type {number} */
  #count
  /** @type {number} */
  #step
  /** @type {number} */
  #loopLength

  /**
   * @param {number} count
   * @param {number} step — slideWidth + gap
   */
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

  /** @returns {number} */
  get step() { return this.#step }
  /** @returns {number} */
  get loopLength() { return this.#loopLength }
  /** @returns {number} */
  get count() { return this.#count }

  /**
   * Normalize to [0, loopLength).
   * @param {number} pos
   * @returns {number}
   */
  normalize(pos) {
    if (this.#loopLength <= 0) return 0
    return ((pos % this.#loopLength) + this.#loopLength) % this.#loopLength
  }

  /**
   * Position → index (0..N-1).
   * @param {number} pos
   * @returns {number}
   */
  toIndex(pos) {
    if (this.#count === 0 || this.#step <= 0) return 0
    const norm = this.normalize(pos)
    return Math.round(norm / this.#step) % this.#count
  }

  /**
   * Shortest delta from current position to target index.
   * @param {number} currentPos
   * @param {number} targetIndex
   * @returns {number}
   */
  shortestDelta(currentPos, targetIndex) {
    if (this.#loopLength <= 0) return 0
    const target = targetIndex * this.#step
    const norm = this.normalize(currentPos)
    let delta = target - norm
    if (delta > this.#loopLength / 2) delta -= this.#loopLength
    if (delta < -this.#loopLength / 2) delta += this.#loopLength
    return delta
  }

  /**
   * Position each slide via its own transform. Track does NOT move.
   *
   * slide[i].transform = translate3d(x, 0, 0)
   * where x = i*step - position + k*L
   * k chosen so x is closest to viewport center.
   *
   * When k changes, the slide is already off-screen — jump is invisible.
   *
   * @param {HTMLElement[]} slides
   * @param {number} position — raw position (viewport offset in px)
   */
  positionSlides(slides, position) {
    if (this.#count === 0 || this.#step <= 0) return
    const L = this.#loopLength

    for (let i = 0; i < slides.length; i++) {
      // Natural position of this slide
      const natural = i * this.#step
      // Where it would be relative to viewport without wrapping
      let x = natural - position
      // Wrap into [-L/2, L/2) range centered on viewport
      x = x - L * Math.floor((x + L / 2) / L)
      slides[i].style.transform = `translate3d(${x}px, 0, 0)`
    }
  }

  #validate(count, step) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('LoopEngine: count must be a non-negative integer')
    }
    if (!Number.isFinite(step) || step < 0) {
      throw new RangeError('LoopEngine: step must be a non-negative finite number')
    }
  }
}

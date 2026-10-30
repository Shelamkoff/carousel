/**
 * Manages slide data. Pure data, no loop/position logic.
 */
export class SlideManager {
  /** @type {import('./types').SlideData[]} */
  #slides

  /** @param {import('./types').SlideData[]} slides */
  constructor(slides) {
    if (!Array.isArray(slides)) throw new TypeError('SlideManager: slides must be an array')
    this.#slides = [...slides]
  }

  /** @returns {import('./types').SlideData[]} */
  getSlides() { return [...this.#slides] }

  /** @param {number} i @returns {import('./types').SlideData | null} */
  getSlide(i) { return this.#slides[i] ?? null }

  /** @returns {number} */
  getSlideCount() { return this.#slides.length }

  /** @param {import('./types').SlideData} slide @param {number} [i] */
  addSlide(slide, i) {
    if (i === undefined) this.#slides.push(slide)
    else {
      if (!Number.isInteger(i) || i < 0 || i > this.#slides.length) {
        throw new RangeError('SlideManager: insertion index is out of range')
      }
      this.#slides.splice(i, 0, slide)
    }
  }

  /** @param {number} i */
  removeSlide(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.#slides.length) {
      throw new RangeError('SlideManager: removal index is out of range')
    }
    this.#slides.splice(i, 1)
  }

  clear() { this.#slides = [] }
}

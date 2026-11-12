import { validateSlide, validateSlides } from './slideData.js'

/** Pure collection state. Opaque keys outlive immutable data updates. */
export class SlideManager {
  #slides = []
  #keys = []

  constructor(slides) { this.setSlides(slides) }
  getSlides() { return [...this.#slides] }
  getSlide(i) { return this.#slides[i] ?? null }
  getSlideCount() { return this.#slides.length }
  getKeys() { return [...this.#keys] }
  getKey(index) { return this.#keys[index] }
  indexOfKey(key) { return this.#keys.indexOf(key) }

  assertIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#slides.length) {
      throw new RangeError('Carousel: slide index is out of range')
    }
  }

  setSlides(slides) {
    validateSlides(slides)
    const pool = new Map()
    for (let i = 0; i < this.#slides.length; i++) {
      const data = this.#slides[i]
      const identity = data.id ?? data
      if (!pool.has(identity)) pool.set(identity, { keys: [], cursor: 0 })
      pool.get(identity).keys.push(this.#keys[i])
    }
    const keys = slides.map(data => {
      const matches = pool.get(data.id ?? data)
      return matches && matches.cursor < matches.keys.length ? matches.keys[matches.cursor++] : {}
    })
    this.#slides = [...slides]
    this.#keys = keys
  }

  updateSlide(index, patch) {
    this.assertIndex(index)
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('Carousel: slide patch must be an object')
    }
    const previous = this.#slides[index]
    if (Object.hasOwn(patch, 'id') && patch.id !== previous.id) {
      throw new TypeError('Carousel: a slide id cannot be changed by updateSlide')
    }
    const next = { ...previous, ...patch }
    validateSlide(next)
    this.#slides[index] = next
    return {
      previous, slide: next,
      contentChanged: Object.hasOwn(patch, 'content'),
      lazyChanged: !!previous.lazy !== !!next.lazy,
      metadataChanged: previous.meta !== next.meta,
      thumbChanged: previous.thumb !== next.thumb,
    }
  }

  moveSlide(from, to) {
    this.assertIndex(from)
    this.assertIndex(to)
    if (from === to) return false
    this.#slides.splice(to, 0, this.#slides.splice(from, 1)[0])
    this.#keys.splice(to, 0, this.#keys.splice(from, 1)[0])
    return true
  }

  addSlide(slide, index = this.#slides.length) {
    if (!Number.isInteger(index) || index < 0 || index > this.#slides.length) {
      throw new RangeError('SlideManager: insertion index is out of range')
    }
    const next = [...this.#slides]
    next.splice(index, 0, slide)
    validateSlides(next)
    this.#slides = next
    // Insertion introduces one occurrence, even when the same data object is
    // already present. Existing occurrences must keep their own DOM identities.
    this.#keys.splice(index, 0, {})
  }

  removeSlide(index) {
    this.assertIndex(index)
    this.#slides.splice(index, 1)
    this.#keys.splice(index, 1)
  }

  clear() { this.#slides = []; this.#keys = [] }
}

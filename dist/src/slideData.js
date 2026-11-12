import { isHTMLElement } from './dom.js'

export function validateSlide(slide) {
  if (!slide || typeof slide !== 'object') throw new TypeError('Carousel: each slide must be an object')
  if (slide.id !== undefined && !(typeof slide.id === 'string' && slide.id.trim()
    || typeof slide.id === 'number' && Number.isFinite(slide.id))) {
    throw new TypeError('Carousel: slide id must be a non-empty string or finite number')
  }
  const content = slide.content
  if (typeof content !== 'string' && typeof content !== 'function' && !isHTMLElement(content)) {
    throw new TypeError('Carousel: slide content must be a string, HTMLElement, or render function')
  }
  if (slide.thumb !== undefined && typeof slide.thumb !== 'string') {
    throw new TypeError('Carousel: slide thumb must be a string')
  }
  if (slide.lazy !== undefined && typeof slide.lazy !== 'boolean') {
    throw new TypeError('Carousel: slide lazy must be a boolean')
  }
  if (slide.meta !== undefined
    && (!slide.meta || typeof slide.meta !== 'object' || Array.isArray(slide.meta))) {
    throw new TypeError('Carousel: slide meta must be an object')
  }
}

export function validateSlides(slides) {
  if (!Array.isArray(slides)) throw new TypeError('Carousel: slides must be an array')
  const ids = new Set()
  for (const slide of slides) {
    validateSlide(slide)
    if (slide.id === undefined) continue
    if (ids.has(slide.id)) throw new TypeError('Carousel: duplicate slide id')
    ids.add(slide.id)
  }
}

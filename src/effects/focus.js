import { createSlideEffect } from './createSlideEffect.js'

/** A small reference effect implemented entirely through the public contract. */
export function createFocusEffect(options = {}) {
  const scale = options.scale ?? .9
  const opacity = options.opacity ?? .6
  const offset = options.offset ?? 0
  if (![scale, opacity].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    || !Number.isFinite(offset)) throw new RangeError('Carousel: invalid focus effect proportions')
  if (options.selector !== undefined && (typeof options.selector !== 'string' || !options.selector.trim())) {
    throw new TypeError('Carousel: focus effect selector must be a non-empty string')
  }
  return createSlideEffect({
    name: options.name ?? 'focus',
    create({ setStyle }) {
      let previous = new Set()
      return {
        render(frame) {
          const next = new Set()
          for (const slide of frame.slides) {
            const targets = options.selector ? slide.element.querySelectorAll(options.selector) : slide.element.children
            const distance = frame.reducedMotion ? 0 : (1 - slide.focus) * offset
            for (const target of targets) {
              next.add(target)
              setStyle(target, 'scale', String(frame.reducedMotion ? 1 : scale + (1 - scale) * slide.focus))
              setStyle(target, 'opacity', String(opacity + (1 - opacity) * slide.focus))
              setStyle(target, 'translate', frame.orientation === 'vertical' ? `${distance}px 0` : `0 ${distance}px`)
            }
          }
          for (const target of previous) {
            if (next.has(target)) continue
            for (const property of ['scale', 'opacity', 'translate']) setStyle(target, property, null)
          }
          previous = next
        },
        destroy() { previous.clear() },
      }
    },
  })
}

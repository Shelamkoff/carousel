import { viewportTransitionPresets } from './presets.js'
import { synchronous } from '../synchronous.js'

export { getPanelCount, getPanelState } from './presets.js'

export function isViewportTransition(transition) {
  if (typeof transition === 'string') return Object.hasOwn(viewportTransitionPresets, transition)
  return transition !== null && typeof transition === 'object' && !Array.isArray(transition)
    && typeof transition.name === 'string' && transition.name.trim().length > 0
    && typeof transition.create === 'function'
}

/**
 * Owns the decorative container, independently of the effect's implementation.
 * Carousel owns the clock, the covered commit boundary and navigation events.
 */
export class ViewportTransition {
  #viewport
  #overlay
  #definition
  #instance = null
  #direction
  #destroyed = false

  constructor(viewport, transition, backwards = false) {
    this.#definition = typeof transition === 'string' ? viewportTransitionPresets[transition] : transition
    this.#direction = backwards ? -1 : 1
    this.#viewport = viewport
    const document = viewport.ownerDocument ?? globalThis.document
    const overlay = document.createElement('div')
    overlay.className = 'carousel__transition'
    overlay.dataset.transition = this.#definition.name
    overlay.setAttribute('aria-hidden', 'true')
    overlay.inert = true
    Object.assign(overlay.style, {
      position: 'absolute', inset: '0', overflow: 'hidden',
      pointerEvents: 'none', zIndex: '1', contain: 'layout paint style',
    })
    this.#overlay = overlay
  }

  get name() { return this.#definition.name }

  /** Register this owner in Carousel before entering application callbacks. */
  initialize() {
    if (this.#destroyed) return
    // Attach the empty layer first so factories can read its real dimensions.
    // Initialization is synchronous; render(0) runs before the next paint.
    this.#viewport.appendChild(this.#overlay)
    if (this.#destroyed) return
    const instance = synchronous(this.#definition.create(Object.freeze({
      container: this.#overlay,
      direction: this.#direction,
    })), 'transition create()')
    // A factory can synchronously update/destroy the carousel before returning
    // its resources. Its late result must still be disposed exactly once.
    if (this.#destroyed) {
      if (typeof instance?.destroy === 'function') synchronous(instance.destroy(), 'transition destroy()')
      return
    }
    this.#instance = instance
    if (!instance || typeof instance.render !== 'function'
      || (instance.destroy !== undefined && typeof instance.destroy !== 'function')) {
      throw new TypeError('Carousel: a transition factory must return render(progress) and an optional destroy()')
    }
    this.render(0)
  }

  render(progress) {
    if (!this.#destroyed) synchronous(this.#instance.render(progress), 'transition render()')
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    const instance = this.#instance
    const overlay = this.#overlay
    this.#instance = null
    this.#overlay = null
    this.#viewport = null
    try {
      if (typeof instance?.destroy === 'function') synchronous(instance.destroy(), 'transition destroy()')
    } finally {
      overlay?.remove()
    }
  }
}

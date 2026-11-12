import { isHTMLElement } from '../dom.js'
import { StyleLedger } from '../effects/StyleLedger.js'
import { synchronous } from '../synchronous.js'
import { createSurfaceSnapshot } from './createSurfaceSnapshot.js'

export function isSurfaceTransition(transition) {
  return !!(transition && typeof transition === 'object' && !Array.isArray(transition)
    && transition.kind === 'surfaces' && typeof transition.name === 'string' && transition.name.trim()
    && typeof transition.createSurfaces === 'function' && (transition.commitAt === undefined
      || Number.isFinite(transition.commitAt) && transition.commitAt >= 0 && transition.commitAt <= 1))
}

/** Owns two inert snapshots; navigation and the single frame clock stay in core. */
export class SurfaceTransition {
  #viewport
  #definition
  #input
  #overlay
  #instance = null
  #initialized = false
  #destroyed = false
  #styles = new StyleLedger()
  #commitAt

  constructor(viewport, definition, input) {
    if (!isSurfaceTransition(definition)) throw new TypeError('Carousel: invalid surface transition definition')
    if (!isHTMLElement(viewport) || !isHTMLElement(input?.fromElement) || !isHTMLElement(input?.toElement)
      || input.trackElement != null && !isHTMLElement(input.trackElement)) {
      throw new TypeError('Carousel: surface transitions require live viewport and slide elements')
    }
    if (![input.fromIndex, input.toIndex].every(index => Number.isInteger(index) && index >= 0)
      || input.direction !== 1 && input.direction !== -1
      || input.orientation !== 'horizontal' && input.orientation !== 'vertical'
      || !Number.isFinite(input.viewportSize) || input.viewportSize < 0) {
      throw new TypeError('Carousel: invalid surface transition geometry')
    }
    this.#viewport = viewport
    this.#definition = definition
    this.#input = { ...input }
    this.#commitAt = definition.commitAt ?? 1
    this.#overlay = viewport.ownerDocument.createElement('div')
    this.#overlay.className = 'carousel__transition carousel__transition--surfaces'
    this.#overlay.dataset.transition = definition.name
    this.#overlay.setAttribute('aria-hidden', 'true')
    this.#overlay.inert = true
    Object.assign(this.#overlay.style, {
      position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none',
      zIndex: '1', contain: 'layout paint style',
    })
  }

  get name() { return this.#definition.name }
  get commitAt() { return this.#commitAt }

  /** Core registers this owner before clone/create callbacks can reenter. */
  initialize() {
    if (this.#destroyed || this.#initialized) return
    this.#initialized = true
    const input = this.#input
    const current = () => !this.#destroyed
    const from = createSurfaceSnapshot(input.fromElement, current)
    if (!current()) return
    const to = createSurfaceSnapshot(input.toElement, current)
    if (!current()) return
    const overlay = this.#overlay
    from.element.classList.add('carousel__surface--from')
    to.element.classList.add('carousel__surface--to')
    from.element.style.zIndex = '0'
    to.element.style.zIndex = '1'
    overlay.append(from.element, to.element)
    this.#viewport.appendChild(overlay)
    if (!current()) return
    from.restoreScroll()
    to.restoreScroll()
    // Keep native focus and media alive. visibility:hidden would blur inputs;
    // opacity masks pixels while the ledger preserves newer application writes.
    if (input.trackElement) {
      this.#styles.set(input.trackElement, 'opacity', '0')
      this.#styles.set(input.trackElement, 'pointer-events', 'none')
    }
    if (!current()) return
    const instance = synchronous(this.#definition.createSurfaces(Object.freeze({
      container: overlay, from: from.element, to: to.element,
      direction: input.direction, fromIndex: input.fromIndex, toIndex: input.toIndex,
      orientation: input.orientation, viewportSize: input.viewportSize,
    })), 'surface transition createSurfaces()')
    if (!current()) {
      if (typeof instance?.destroy === 'function') synchronous(instance.destroy(), 'surface transition destroy()')
      return
    }
    this.#instance = instance
    if (!instance || typeof instance.render !== 'function'
      || instance.destroy !== undefined && typeof instance.destroy !== 'function') {
      throw new TypeError('Carousel: a surface transition must return render(progress) and optional destroy()')
    }
    this.render(0)
  }

  render(progress) {
    if (this.#destroyed) return
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError('Carousel: surface transition progress must be between 0 and 1')
    }
    synchronous(this.#instance.render(progress), 'surface transition render()')
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    const instance = this.#instance
    const overlay = this.#overlay
    this.#instance = null
    this.#overlay = null
    this.#viewport = null
    this.#input = null
    try {
      if (typeof instance?.destroy === 'function') synchronous(instance.destroy(), 'surface transition destroy()')
    } finally {
      try { overlay?.remove() }
      finally { this.#styles.clear() }
    }
  }
}

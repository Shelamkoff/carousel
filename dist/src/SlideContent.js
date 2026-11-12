import { isHTMLElement } from './dom.js'
import { synchronous } from './synchronous.js'

// A factory element belongs to one rendered slide, including across carousels.
const elementOwners = new WeakMap()

/** Owns content resources; visual copies never acquire an owner. */
export class SlideContent {
  #owners = new Map()
  #operations = new WeakMap()
  #report

  constructor(reportError) { this.#report = reportError }

  #begin(wrapper, isCurrent) {
    const operation = {}
    this.#operations.set(wrapper, operation)
    return () => this.#operations.get(wrapper) === operation && isCurrent()
  }

  #index(wrapper, fallback) {
    const index = Number(wrapper.dataset.index)
    return Number.isInteger(index) && index >= 0 ? index : fallback
  }

  #error(index, error, report = this.#report) {
    report(index, error instanceof Error ? error : new Error(String(error)))
  }

  #dispose(owner, report = this.#report) {
    if (!owner || owner.released) return
    owner.released = true
    if (this.#owners.get(owner.wrapper) === owner) this.#owners.delete(owner.wrapper)
    if (elementOwners.get(owner.element) === owner) elementOwners.delete(owner.element)
    try { synchronous(owner.destroy?.(), 'slide content destroy()') }
    catch (error) { this.#error(this.#index(owner.wrapper, owner.index), error, report) }
  }

  #reset(wrapper, current) {
    delete wrapper.dataset.rendered
    delete wrapper.dataset.loaded
    wrapper.classList.remove('carousel__slide--error', 'carousel__slide--loaded')
    this.#dispose(this.#owners.get(wrapper))
    if (!current()) return false
    wrapper.replaceChildren()
    return current()
  }

  #acquire(value, wrapper, index) {
    const resource = !isHTMLElement(value) && value && typeof value === 'object' ? value : null
    const element = resource ? resource.element : value
    const destroy = resource?.destroy
    if (destroy !== undefined && typeof destroy !== 'function') {
      throw new TypeError('Carousel: slide content destroy must be a function')
    }
    const owner = { wrapper, element, index, released: false,
      destroy: destroy ? () => destroy.call(resource) : undefined }
    if (!isHTMLElement(element)) {
      this.#dispose(owner)
      throw new TypeError('Carousel: slide factory must return an HTMLElement or { element, destroy? }')
    }
    if (elementOwners.has(element)) {
      throw new TypeError('Carousel: a slide content element already has an owner')
    }
    elementOwners.set(element, owner)
    return owner
  }

  render(wrapper, content, index, isCurrent = () => true) {
    const current = this.#begin(wrapper, isCurrent)
    let owner = null
    try {
      if (!this.#reset(wrapper, current)) return false
      if (typeof content === 'string') wrapper.innerHTML = content
      else {
        const value = typeof content === 'function'
          ? synchronous(content(), 'slide content factory()')
          : content.cloneNode(true)
        owner = this.#acquire(value, wrapper, index)
        if (!current()) { this.#dispose(owner); return false }
        this.#owners.set(wrapper, owner)
        wrapper.appendChild(owner.element)
      }
      if (!current()) {
        // A nested rebuild may have retained this wrapper without adopting the
        // unfinished factory result. Release only this operation's ownership.
        if (owner && this.#owners.get(wrapper) === owner) {
          this.#dispose(owner)
          if (!this.#owners.has(wrapper) && owner.element.parentNode === wrapper) owner.element.remove()
        }
        return false
      }
      wrapper.dataset.rendered = 'true'
      return true
    } catch (error) {
      this.#dispose(owner)
      if (!current()) return false
      wrapper.replaceChildren()
      if (!current()) return false
      wrapper.dataset.rendered = 'error'
      wrapper.classList.add('carousel__slide--error')
      this.#error(index, error)
      return false
    }
  }

  clear(wrapper, index, isCurrent = () => true) {
    const current = this.#begin(wrapper, isCurrent)
    return this.#reset(wrapper, current)
  }

  releaseUnused(kept, isCurrent = () => true) {
    for (const [wrapper, owner] of [...this.#owners]) {
      if (kept.has(wrapper)) continue
      if (!this.clear(wrapper, owner.index, isCurrent)) return false
    }
    return isCurrent()
  }

  destroy(report = this.#report) {
    const retired = [...this.#owners.values()]
    this.#owners = new Map()
    this.#operations = new WeakMap()
    for (const owner of retired) this.#dispose(owner, report)
  }
}

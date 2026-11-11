export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map()

  /** @type {boolean} */
  #debug

  /**
   * @param {object} [options]
   * @param {boolean} [options.debug=false]
   */
  constructor({ debug = false } = {}) {
    if (typeof debug !== 'boolean') throw new TypeError('debug must be a boolean')
    this.#debug = debug
  }

  /** @returns {() => void} */
  on(event, handler) {
    this.#assertEventName(event)
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler must be a function, got ${typeof handler}`)
    }
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set())
    this.#listeners.get(event).add(handler)
    return () => this.off(event, handler)
  }

  off(event, handler) {
    this.#assertEventName(event)
    if (typeof handler !== 'function') throw new TypeError('Handler must be a function')
    const listeners = this.#listeners.get(event)
    if (!listeners) return
    listeners.delete(handler)
    if (listeners.size === 0) this.#listeners.delete(event)
  }

  /** @returns {() => void} */
  once(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler must be a function, got ${typeof handler}`)
    }
    const wrapper = (...args) => {
      this.off(event, wrapper)
      return handler(...args)
    }
    return this.on(event, wrapper)
  }

  emit(event, ...args) {
    this.#assertEventName(event)
    if (this.#debug) console.log(`[EventBus] emit: ${event}`, ...args)
    const handlers = this.#listeners.get(event)
    if (!handlers) return
    for (const handler of [...handlers]) {
      try {
        const result = handler(...args)
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).catch(error => {
            console.error(`[EventBus] Error in async handler for "${event}":`, error)
          })
        }
      } catch (error) {
        console.error(`[EventBus] Error in handler for "${event}":`, error)
      }
    }
  }

  clear(event) {
    if (event !== undefined) {
      this.#assertEventName(event)
      this.#listeners.delete(event)
    }
    else this.#listeners.clear()
  }

  has(event) {
    this.#assertEventName(event)
    return this.#listeners.has(event)
  }

  #assertEventName(event) {
    if (typeof event !== 'string' || event.length === 0) {
      throw new TypeError('Event name must be a non-empty string')
    }
  }
}

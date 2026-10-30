/**
 * Manages responsive configuration overrides using window.matchMedia.
 * Single Responsibility: breakpoint detection and options merging.
 */
export class BreakpointManager {
  /** @type {import('./types').CarouselOptions} */
  #baseOptions

  /** @type {[number, Partial<import('./types').CarouselOptions>][]} — sorted ascending */
  #breakpoints

  /** @type {{ mql: MediaQueryList, handler: () => void }[]} */
  #queries = []

  /** @type {(() => void) | null} */
  #onChange = null

  /**
   * @param {import('./types').CarouselOptions} baseOptions
   * @param {Record<number, Partial<import('./types').CarouselOptions>>} [breakpoints]
   */
  constructor(baseOptions, breakpoints) {
    this.#baseOptions = { ...baseOptions }

    this.#breakpoints = breakpoints
      ? Object.entries(breakpoints)
          .map(([k, v]) => [Number(k), v])
          .filter(([minWidth]) => Number.isFinite(minWidth) && minWidth >= 0)
          .sort((a, b) => /** @type {number} */ (a[0]) - /** @type {number} */ (b[0]))
      : []

    this.#setupQueries()
  }

  #setupQueries() {
    for (const [minWidth] of this.#breakpoints) {
      const mql = window.matchMedia(`(min-width: ${minWidth}px)`)
      const handler = () => this.#onChange?.()
      mql.addEventListener('change', handler)
      this.#queries.push({ mql, handler })
    }
  }

  #clearQueries() {
    for (const { mql, handler } of this.#queries) {
      mql.removeEventListener('change', handler)
    }
    this.#queries = []
  }

  /**
   * Register a callback for breakpoint changes.
   * @param {() => void} callback
   */
  onChange(callback) {
    if (typeof callback !== 'function') throw new TypeError('Breakpoint callback must be a function')
    this.#onChange = callback
  }

  /**
   * Resolve merged options for the current viewport width.
   * Applies all matching breakpoints in ascending order.
   * @returns {import('./types').CarouselOptions}
   */
  resolve() {
    /** @type {import('./types').CarouselOptions} */
    const merged = { ...this.#baseOptions }

    for (let i = 0; i < this.#breakpoints.length; i++) {
      if (this.#queries[i]?.mql.matches) {
        const override = this.#breakpoints[i][1]
        Object.assign(merged, override)
      }
    }

    // Never merge sub-breakpoints into result
    delete merged.breakpoints
    delete merged.plugins

    return merged
  }

  /**
   * Update base options (e.g. after runtime reconfiguration).
   * @param {import('./types').CarouselOptions} options
   */
  updateBase(options) {
    this.#baseOptions = { ...options }
    this.#clearQueries()
    this.#breakpoints = options.breakpoints
      ? Object.entries(options.breakpoints)
          .map(([k, v]) => [Number(k), v])
          .filter(([minWidth]) => Number.isFinite(minWidth) && minWidth >= 0)
          .sort((a, b) => /** @type {number} */ (a[0]) - /** @type {number} */ (b[0]))
      : []
    this.#setupQueries()
  }

  /** Remove all matchMedia listeners. */
  destroy() {
    this.#clearQueries()
    this.#onChange = null
    this.#baseOptions = {}
    this.#breakpoints = []
  }
}

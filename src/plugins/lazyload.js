/**
 * Lazy load plugin — defers rendering + preloads adjacent slides.
 *
 * @param {object} [options]
 * @param {string} [options.rootMargin='200px']
 * @param {number} [options.threshold=0]
 * @param {number} [options.preload=1] — preload ±N adjacent slides
 * @returns {import('../types').CarouselPlugin}
 */
export function createLazyLoad(options = {}) {
  let ctx = null
  let unsubs = []
  /** @type {IntersectionObserver | null} */
  let observer = null

  const rootMargin = options.rootMargin ?? '200px'
  const observerThreshold = options.threshold ?? 0
  const preloadCount = options.preload ?? 1
  if (typeof rootMargin !== 'string' || rootMargin.trim() === '') {
    throw new TypeError('Carousel lazy-load rootMargin must be a non-empty string')
  }
  if (!Number.isFinite(observerThreshold) || observerThreshold < 0 || observerThreshold > 1) {
    throw new RangeError('Carousel lazy-load threshold must be between 0 and 1')
  }
  if (!Number.isInteger(preloadCount) || preloadCount < 0) {
    throw new RangeError('Carousel lazy-load preload must be a non-negative integer')
  }

  /**
   * @param {HTMLElement} el
   * @param {number} idx
   */
  function loadSlide(el, idx) {
    if (!ctx || el !== ctx.getSlideElement(idx)) return
    if (el.dataset.loaded === 'true' || el.dataset.loaded === 'error') return
    if (!ctx.getSlide(idx)) return

    // The core renderer owns content insertion, validation and error events.
    // Plugins must not reimplement markup rendering independently.
    if (!ctx.renderSlide(idx)) {
      el.dataset.loaded = 'error'
      return
    }

    el.dataset.loaded = 'true'
    el.classList.add('carousel__slide--loaded')
    ctx.emit('slide:lazyload', { index: idx, element: el })
  }

  function preloadAdjacent() {
    if (!ctx) return
    const idx = ctx.getIndex()
    const count = ctx.getSlideCount()
    if (count === 0) return

    for (let d = -preloadCount; d <= preloadCount; d++) {
      let i = idx + d
      if (ctx.isLoop()) i = ((i % count) + count) % count
      else if (i < 0 || i >= count) continue

      const el = ctx.getSlideElement(i)
      if (el && ctx.getSlide(i)?.lazy) loadSlide(el, i)
    }
  }

  function observeLazySlides() {
    if (!observer || !ctx) return
    const slideEls = ctx.getSlideElements()
    const slides = ctx.getSlides()

    for (let i = 0; i < slideEls.length; i++) {
      const el = slideEls[i]
      if (el.dataset.loaded === 'true' || el.dataset.loaded === 'error') continue
      if (el.dataset.clone === 'true') continue
      const idx = parseInt(el.dataset.index ?? '-1', 10)
      if (idx < 0 || idx >= slides.length || !slides[idx].lazy) continue
      observer.observe(el)
    }
  }

  return {
    name: 'lazyload',

    install(context) {
      ctx = context
      const viewport = context.getViewport()
      if (!viewport) return

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const el = /** @type {HTMLElement} */ (entry.target)
            if (el.dataset.loaded === 'true' || el.dataset.loaded === 'error') { observer?.unobserve(el); continue }
            const idx = parseInt(el.dataset.index ?? '-1', 10)
            if (idx >= 0) loadSlide(el, idx)
            observer?.unobserve(el)
          }
        },
        { root: viewport, rootMargin, threshold: observerThreshold },
      )

      observeLazySlides()
      preloadAdjacent()

      unsubs.push(
        context.on('slide:change', preloadAdjacent),
        context.on('resize', () => {
          observer?.disconnect()
          observeLazySlides()
          preloadAdjacent()
        }),
      )
    },

    destroy() {
      observer?.disconnect()
      observer = null
      unsubs.forEach(fn => fn())
      unsubs = []
      ctx = null
    },
  }
}

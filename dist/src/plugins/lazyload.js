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
    const context = ctx
    if (!context || el !== context.getSlideElement(idx)) return
    if (el.dataset.loaded === 'true' || el.dataset.loaded === 'error') return
    if (!context.getSlide(idx)) return

    // The core renderer owns content insertion, validation and error events.
    // Plugins must not reimplement markup rendering independently.
    const rendered = context.renderSlide(idx)
    // Rendering can invoke application callbacks that rebuild or destroy
    // the carousel. Do not publish a result for a stale slide element.
    if (ctx !== context || el !== context.getSlideElement(idx)) return
    if (!rendered) {
      // false also means that a nested rebuild cancelled this operation.
      // Only the renderer's explicit error state is a failed lazy render.
      if (el.dataset.rendered === 'error') el.dataset.loaded = 'error'
      return
    }

    el.dataset.loaded = 'true'
    el.classList.add('carousel__slide--loaded')
    context.emit('slide:lazyload', { index: idx, element: el })
  }

  function preloadAdjacent(targetIndex = null, includeVisible = false) {
    const context = ctx
    if (!context) return
    const idx = targetIndex ?? context.getIndex()
    const count = context.getSlideCount()
    if (count === 0) return

    // A radius covering the whole carousel still needs only one pass.
    // Clamp before iterating, including for integers above Number.MAX_SAFE_INTEGER.
    const loop = context.isLoop()
    const radius = Math.min(preloadCount, count - 1)
    const perView = includeVisible ? context.getSlidesPerView() : 1
    // The last finite page can begin before its logical target index when
    // slidesPerView is fractional. Include that partially visible first slide.
    const firstVisible = loop ? idx : Math.floor(Math.min(idx, Math.max(0, count - perView)))
    const visibleCount = Math.min(count, Math.ceil(perView))
    const first = loop ? firstVisible - radius : Math.max(0, firstVisible - radius)
    const last = Math.min(firstVisible + visibleCount - 1 + radius, loop ? first + count - 1 : count - 1)
    for (let position = first; position <= last; position++) {
      if (ctx !== context) return
      const i = loop ? ((position % count) + count) % count : position

      const el = context.getSlideElement(i)
      if (el && context.getSlide(i)?.lazy) loadSlide(el, i)
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
      const Observer = viewport.ownerDocument?.defaultView?.IntersectionObserver ?? globalThis.IntersectionObserver

      observer = new Observer(
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
        // Effects and distant jumps must start with rendered target content.
        context.on('slide:beforeChange', ({ toIndex }) => preloadAdjacent(toIndex, true)),
        context.on('slide:change', () => preloadAdjacent()),
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

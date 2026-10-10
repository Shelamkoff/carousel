const ARROW_SVG = {
  prev: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>',
  next: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>',
}

/**
 * Arrows plugin — prev/next navigation buttons.
 *
 * @param {object} [options]
 * @param {string} [options.prevHTML] — custom prev button markup
 * @param {string} [options.nextHTML] — custom next button markup
 * @param {boolean} [options.hideOnEdge=true] — hide at boundaries when not looping
 * @returns {import('../types').CarouselPlugin}
 */
export function createArrows(options = {}) {
  let ctx = null
  let unsubs = []
  let prevBtn = null
  let nextBtn = null

  const hideOnEdge = options.hideOnEdge ?? true
  if (typeof hideOnEdge !== 'boolean') throw new TypeError('Carousel arrows hideOnEdge must be a boolean')
  if (options.prevHTML !== undefined && typeof options.prevHTML !== 'string') throw new TypeError('Carousel arrows prevHTML must be a string')
  if (options.nextHTML !== undefined && typeof options.nextHTML !== 'string') throw new TypeError('Carousel arrows nextHTML must be a string')

  function updateVisibility() {
    if (!ctx || !prevBtn || !nextBtn) return
    const count = ctx.getSlideCount()
    if (count <= 1) {
      prevBtn.style.display = 'none'
      nextBtn.style.display = 'none'
      return
    }
    if (ctx.isLoop()) {
      prevBtn.style.display = ''
      nextBtn.style.display = ''
      return
    }
    if (!hideOnEdge) {
      prevBtn.style.display = ''
      nextBtn.style.display = ''
      return
    }

    const index = ctx.getIndex()
    const perView = ctx.getSlidesPerView()
    const maxIndex = Math.max(0, Math.ceil(count - perView))
    prevBtn.style.display = index <= 0 ? 'none' : ''
    nextBtn.style.display = index >= maxIndex ? 'none' : ''
  }

  return {
    name: 'arrows',

    install(context) {
      ctx = context
      const viewport = context.getViewport()
      if (!viewport) return

      prevBtn = document.createElement('button')
      prevBtn.className = 'carousel__arrow carousel__arrow--prev'
      prevBtn.type = 'button'
      prevBtn.setAttribute('aria-label', 'Previous slide')
      prevBtn.innerHTML = options.prevHTML ?? ARROW_SVG.prev
      prevBtn.addEventListener('click', () => context.prev())

      nextBtn = document.createElement('button')
      nextBtn.className = 'carousel__arrow carousel__arrow--next'
      nextBtn.type = 'button'
      nextBtn.setAttribute('aria-label', 'Next slide')
      nextBtn.innerHTML = options.nextHTML ?? ARROW_SVG.next
      nextBtn.addEventListener('click', () => context.next())

      viewport.appendChild(prevBtn)
      viewport.appendChild(nextBtn)

      unsubs.push(
        context.on('slide:change', updateVisibility),
        context.on('resize', updateVisibility),
      )

      updateVisibility()
    },

    destroy() {
      unsubs.forEach(fn => fn())
      unsubs = []
      prevBtn?.remove()
      nextBtn?.remove()
      prevBtn = null
      nextBtn = null
      ctx = null
    },
  }
}

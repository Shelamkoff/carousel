/**
 * Thumbnails plugin — thumbnail strip for navigation.
 *
 * @param {object} [options]
 * @param {number} [options.width=60] — fallback thumbnail width in px
 * @param {number} [options.height=40] — fallback thumbnail height in px
 * @param {'bottom' | 'left' | 'right'} [options.position='bottom'] — strip position
 * @returns {import('../types').CarouselPlugin}
 */
export function createThumbnails(options = {}) {
  let ctx = null
  let unsubs = []
  let container = null
  /** @type {HTMLElement[]} */
  let thumbEls = []
  let thumbImages = []
  let thumbSources = []

  const width = options.width ?? 60
  const height = options.height ?? 40
  const position = options.position ?? 'bottom'
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Carousel thumbnail dimensions must be positive numbers')
  }
  if (!['bottom', 'left', 'right'].includes(position)) {
    throw new TypeError('Carousel thumbnail position must be bottom, left, or right')
  }

  function updateThumb(index, slide) {
    const thumb = thumbEls[index]
    if (!thumb) return
    const src = slide?.thumb || undefined
    if (thumbSources[index] === src) return
    thumbSources[index] = src
    if (!src) {
      thumbImages[index]?.remove()
      thumbImages[index] = null
      return
    }
    let image = thumbImages[index]
    if (!image) {
      const document = thumb.ownerDocument ?? globalThis.document
      image = document.createElement('img')
      image.alt = ''
      image.draggable = false
      thumbImages[index] = image
      thumb.appendChild(image)
    }
    image.src = src
  }

  function updateSlides(change) {
    if (!ctx || change?.type !== 'update' || !change.fields?.includes('thumb')) return
    const slides = typeof ctx.getSlide === 'function' ? null : ctx.getSlides()
    for (const index of change.updated ?? []) {
      updateThumb(index, slides ? slides[index] : ctx.getSlide(index))
    }
  }

  function buildThumbs() {
    if (!container || !ctx) return
    const owner = ctx
    const document = container.ownerDocument ?? globalThis.document
    container.innerHTML = ''
    thumbEls = []
    thumbImages = []
    thumbSources = []

    const slides = ctx.getSlides()
    for (let i = 0; i < slides.length; i++) {
      const thumb = document.createElement('button')
      thumb.className = 'carousel__thumb'
      thumb.type = 'button'
      thumb.style.width = `var(--carousel-thumb-width, ${width}px)`
      thumb.style.height = `var(--carousel-thumb-height, ${height}px)`
      thumb.setAttribute('aria-label', `Go to slide ${i + 1}`)

      thumb.addEventListener('click', () => {
        if (ctx === owner && thumbEls[i] === thumb) owner.goTo(i)
      })
      thumbEls.push(thumb)
      updateThumb(i, slides[i])
      container.appendChild(thumb)
    }

    updateActive()
  }

  function updateActive() {
    if (!ctx) return
    const index = ctx.getIndex()
    for (let i = 0; i < thumbEls.length; i++) {
      thumbEls[i].classList.toggle('carousel__thumb--active', i === index)
      thumbEls[i].setAttribute('aria-current', i === index ? 'page' : 'false')
    }
  }

  return {
    name: 'thumbnails',

    install(context) {
      ctx = context
      const root = context.getRoot()
      if (!root) return
      const document = root.ownerDocument ?? globalThis.document

      container = document.createElement('div')
      container.className = `carousel__thumbnails carousel__thumbnails--${position}`

      if (position === 'left' || position === 'right') {
        root.classList.add(`carousel--thumbs-${position}`)
      }

      root.appendChild(container)
      buildThumbs()

      unsubs.push(
        context.on('slide:change', updateActive),
        context.on('resize', buildThumbs),
        context.on('slides:change', updateSlides),
      )
    },

    destroy() {
      unsubs.forEach(fn => fn())
      unsubs = []
      container?.remove()
      const root = ctx?.getRoot()
      root?.classList.remove('carousel--thumbs-left', 'carousel--thumbs-right')
      container = null
      thumbEls = []
      thumbImages = []
      thumbSources = []
      ctx = null
    },
  }
}

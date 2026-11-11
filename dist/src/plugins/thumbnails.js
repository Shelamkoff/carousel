/**
 * Thumbnails plugin — thumbnail strip for navigation.
 *
 * @param {object} [options]
 * @param {number} [options.width=60] — thumbnail width in px
 * @param {number} [options.height=40] — thumbnail height in px
 * @param {'bottom' | 'left' | 'right'} [options.position='bottom'] — strip position
 * @returns {import('../types').CarouselPlugin}
 */
export function createThumbnails(options = {}) {
  let ctx = null
  let unsubs = []
  let container = null
  /** @type {HTMLElement[]} */
  let thumbEls = []

  const width = options.width ?? 60
  const height = options.height ?? 40
  const position = options.position ?? 'bottom'
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Carousel thumbnail dimensions must be positive numbers')
  }
  if (!['bottom', 'left', 'right'].includes(position)) {
    throw new TypeError('Carousel thumbnail position must be bottom, left, or right')
  }

  function buildThumbs() {
    if (!container || !ctx) return
    container.innerHTML = ''
    thumbEls = []

    const slides = ctx.getSlides()
    for (let i = 0; i < slides.length; i++) {
      const thumb = document.createElement('button')
      thumb.className = 'carousel__thumb'
      thumb.type = 'button'
      thumb.style.width = width + 'px'
      thumb.style.height = height + 'px'
      thumb.setAttribute('aria-label', `Go to slide ${i + 1}`)

      const src = slides[i].thumb
      if (src) {
        const img = document.createElement('img')
        img.src = src
        img.alt = ''
        img.draggable = false
        thumb.appendChild(img)
      }

      thumb.addEventListener('click', () => ctx.goTo(i))
      thumbEls.push(thumb)
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
      ctx = null
    },
  }
}

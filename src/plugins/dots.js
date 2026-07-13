/**
 * Dots plugin — pagination based on slidesPerScroll.
 *
 * @param {object} [options]
 * @param {boolean} [options.clickable=true]
 * @returns {import('../types').CarouselPlugin}
 */
export function createDots(options = {}) {
  let ctx = null
  let unsubs = []
  let container = null
  /** @type {HTMLElement[]} */
  let dotEls = []

  const clickable = options.clickable ?? true
  if (typeof clickable !== 'boolean') throw new TypeError('Carousel dots clickable must be a boolean')

  function getTargets() {
    if (!ctx) return []
    const count = ctx.getSlideCount()
    if (count === 0) return []
    const step = Math.max(1, ctx.getSlidesPerScroll())
    const maxIndex = ctx.isLoop()
      ? count - 1
      : Math.max(0, Math.ceil(count - ctx.getSlidesPerView()))
    const targets = []
    for (let index = 0; index <= maxIndex; index += step) targets.push(index)
    if (!ctx.isLoop() && targets.at(-1) !== maxIndex) targets.push(maxIndex)
    return targets
  }

  function getActivePage() {
    if (!ctx) return 0
    const targets = getTargets()
    const index = ctx.getIndex()
    let active = 0
    for (let i = 1; i < targets.length; i++) {
      if (Math.abs(targets[i] - index) < Math.abs(targets[active] - index)) active = i
    }
    return active
  }

  function buildDots() {
    if (!container || !ctx) return
    container.innerHTML = ''
    dotEls = []

    const targets = getTargets()

    for (let i = 0; i < targets.length; i++) {
      const dot = document.createElement(clickable ? 'button' : 'span')
      dot.className = 'carousel__dot'

      if (clickable) {
        dot.type = 'button'
        dot.setAttribute('aria-label', `Go to page ${i + 1}`)
        dot.addEventListener('click', () => {
          ctx.goTo(targets[i])
        })
      } else {
        dot.setAttribute('role', 'img')
        dot.setAttribute('aria-label', `Page ${i + 1} of ${targets.length}`)
      }

      dotEls.push(dot)
      container.appendChild(dot)
    }

    updateActive()
  }

  function updateActive() {
    const active = getActivePage()
    for (let i = 0; i < dotEls.length; i++) {
      dotEls[i].classList.toggle('carousel__dot--active', i === active)
      dotEls[i].setAttribute('aria-current', i === active ? 'page' : 'false')
    }
  }

  return {
    name: 'dots',

    install(context) {
      ctx = context
      const root = context.getRoot()
      if (!root) return

      container = document.createElement('div')
      container.className = 'carousel__dots'
      container.setAttribute('role', clickable ? 'navigation' : 'group')
      container.setAttribute('aria-label', 'Carousel pagination')
      root.appendChild(container)

      buildDots()

      unsubs.push(
        context.on('slide:change', updateActive),
        context.on('resize', buildDots),
      )
    },

    destroy() {
      unsubs.forEach(fn => fn())
      unsubs = []
      container?.remove()
      container = null
      dotEls = []
      ctx = null
    },
  }
}

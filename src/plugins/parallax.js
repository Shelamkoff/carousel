/**
 * Parallax plugin — depth effect (Embla-style).
 *
 * Each slide gets a `.carousel__parallax` overflow wrapper and
 * a `.carousel__parallax__layer` that shifts along the carousel's axis.
 * Content inside the layer should be larger than the slide on that axis
 * (e.g. images with object-fit:cover) to reveal the effect.
 *
 * @param {object} [options]
 * @param {number} [options.factor=0.2] — base parallax intensity
 * @returns {import('../types').CarouselPlugin}
 */
export function createParallax(options = {}) {
  let ctx = null
  let unsubs = []
  /** @type {number} */
  let rafId = 0
  /** @type {HTMLElement[]} */
  let layers = []
  /** @type {number} */
  let tweenFactor = 0
  /** @type {boolean} */
  let running = false
  let transitioning = false
  let settleRafId = 0
  let ownerWindow = null

  const factor = options.factor ?? 0.2
  if (!Number.isFinite(factor)) throw new TypeError('Carousel parallax factor must be finite')
  const factorBase = Math.max(0, Math.min(factor, 1))

  const requestFrame = callback => ownerWindow
    ? ownerWindow.requestAnimationFrame(callback)
    : requestAnimationFrame(callback)
  const cancelFrame = id => ownerWindow
    ? ownerWindow.cancelAnimationFrame(id)
    : cancelAnimationFrame(id)

  // Never adopt a nested carousel's decorative layer as this slide's wrapper.
  const childWithClass = (parent, name) => [...parent.children]
    .find(child => child.classList.contains(name)) ?? null

  function wrapSlides() {
    if (!ctx) return
    const slides = ctx.getVisualElements()
    tweenFactor = factorBase * ctx.getSlideCount()

    layers = slides.map(slide => {
      const document = slide.ownerDocument ?? globalThis.document
      let parallax = childWithClass(slide, 'carousel__parallax')
      if (!parallax) {
        parallax = document.createElement('div')
        parallax.className = 'carousel__parallax'
        const layer = document.createElement('div')
        layer.className = 'carousel__parallax__layer'
        while (slide.firstChild) layer.appendChild(slide.firstChild)
        parallax.appendChild(layer)
        slide.appendChild(parallax)
      }
      return childWithClass(parallax, 'carousel__parallax__layer')
    })
  }

  function unwrapSlides() {
    const slides = ctx?.getVisualElements() ?? []
    for (let i = 0; i < slides.length; i++) {
      const parallax = childWithClass(slides[i], 'carousel__parallax')
      if (!parallax) continue
      const layer = childWithClass(parallax, 'carousel__parallax__layer')
      if (layer) {
        while (layer.firstChild) slides[i].appendChild(layer.firstChild)
      }
      parallax.remove()
    }
    layers = []
  }

  // All transitions now use the core's position-based rAF clock.
  // No computed-style reads or DOMMatrix reconstruction are necessary.
  function getVisualPosition() {
    return ctx?.getPosition() ?? 0
  }

  function update() {
    if (!ctx) return
    const step = ctx.getStep()
    if (step <= 0) return

    const engine = ctx.getLoopEngine()
    const pos = getVisualPosition()
    const count = ctx.getSlideCount()
    const visualSlides = ctx.getVisualElements()
    const vertical = ctx.options?.orientation === 'vertical'
    if (count === 0) return

    for (let i = 0; i < layers.length; i++) {
      if (!layers[i]) continue
      const slide = visualSlides[i]
      if (!slide) continue

      let diffToTarget
      if (engine) {
        // LoopEngine provides the inline translated position of each slot.
        // Reading it avoids forced style/layout calculations on every frame.
        const transform = slide.style.transform
        const coordinate = vertical ? transform.indexOf(',') + 1 : 'translate3d('.length
        const offset = Number.parseFloat(transform.slice(coordinate))
        if (!Number.isFinite(offset)) { layers[i].style.transform = ''; continue }
        diffToTarget = offset / step / count
      } else {
        // Non-loop: normalized distance from viewport
        diffToTarget = (i * step - pos) / step / count
      }

      const translate = diffToTarget * (-1 * tweenFactor) * 100
      layers[i].style.transform = `${vertical ? 'translateY' : 'translateX'}(${translate}%)`
    }

  }

  function tick() {
    rafId = 0
    if (!running || !ctx) return
    update()
    if (running) rafId = requestFrame(tick)
  }

  /** Start the rAF loop (idempotent). */
  function startLoop() {
    if (running) return
    running = true
    rafId = requestFrame(tick)
  }

  /** Stop the rAF loop and run one final update to settle. */
  function stopLoop() {
    running = false
    if (rafId) {
      cancelFrame(rafId)
      rafId = 0
    }
    // One final frame to land at exact position
    update()
  }

  // snapBack() intentionally emits no transition events. After pointerup,
  // keep updating the effect until the position has stopped changing.
  function settleWhenIdle() {
    if (settleRafId) cancelFrame(settleRafId)
    let last = ctx?.getPosition() ?? 0
    let stableFrames = 0
    const check = () => {
      settleRafId = 0
      if (!ctx || transitioning) return
      const position = ctx.getPosition()
      stableFrames = Math.abs(position - last) < 0.001 ? stableFrames + 1 : 0
      last = position
      if (stableFrames >= 2) { stopLoop(); return }
      settleRafId = requestFrame(check)
    }
    settleRafId = requestFrame(check)
  }

  return {
    name: 'parallax',

    install(context) {
      ctx = context
      ownerWindow = context.getViewport()?.ownerDocument?.defaultView ?? null
      wrapSlides()

      // Initial position (single frame)
      update()

      unsubs.push(
        // Slide/fade transitions
        context.on('transition:start', () => { transitioning = true; startLoop() }),
        context.on('transition:end', () => { transitioning = false; stopLoop() }),
        context.on('slide:lazyload', () => { wrapSlides(); update() }),
        // Rebuild after breakpoint change — rewrap new DOM elements
        context.on('resize', () => {
          if (!ctx) return
          // Rebuilds cancel the core transition without transition:end.
          transitioning = false
          if (settleRafId) { cancelFrame(settleRafId); settleRafId = 0 }
          wrapSlides()
          stopLoop()
        }),
      )

      // Intercept setPositionDrag for swipe support:
      // The swipe plugin calls setPositionDrag on every pointermove.
      // We hook into pointer events on the viewport to drive the rAF loop during drag.
      const viewport = context.getViewport()
      if (viewport) {
        const eventWindow = ownerWindow ?? window
        const onPointerDown = () => { transitioning = false; startLoop() }
        const onPointerUp = () => settleWhenIdle()
        viewport.addEventListener('pointerdown', onPointerDown)
        eventWindow.addEventListener('pointerup', onPointerUp)
        eventWindow.addEventListener('pointercancel', onPointerUp)

        unsubs.push(() => {
          viewport.removeEventListener('pointerdown', onPointerDown)
          eventWindow.removeEventListener('pointerup', onPointerUp)
          eventWindow.removeEventListener('pointercancel', onPointerUp)
        })
      }
    },

    destroy() {
      running = false
      transitioning = false
      if (settleRafId) { cancelFrame(settleRafId); settleRafId = 0 }
      if (rafId) { cancelFrame(rafId); rafId = 0 }
      unsubs.forEach(fn => fn())
      unsubs = []
      unwrapSlides()
      ctx = null
      ownerWindow = null
    },
  }
}

/**
 * Parallax plugin — depth effect (Embla-style).
 *
 * Each slide gets a `.carousel__parallax` overflow wrapper and
 * a `.carousel__parallax__layer` that shifts via translateX.
 * Content inside the layer should be wider than the slide
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

  const factor = options.factor ?? 0.2
  if (!Number.isFinite(factor)) throw new TypeError('Carousel parallax factor must be finite')
  const factorBase = Math.max(0, Math.min(factor, 1))

  function wrapSlides() {
    if (!ctx) return
    const slides = ctx.getSlideElements()
    tweenFactor = factorBase * slides.length

    layers = slides.map(slide => {
      let parallax = slide.querySelector('.carousel__parallax')
      if (!parallax) {
        parallax = document.createElement('div')
        parallax.className = 'carousel__parallax'
        const layer = document.createElement('div')
        layer.className = 'carousel__parallax__layer'
        while (slide.firstChild) layer.appendChild(slide.firstChild)
        parallax.appendChild(layer)
        slide.appendChild(parallax)
      }
      return parallax.querySelector('.carousel__parallax__layer')
    })
  }

  function unwrapSlides() {
    const slides = ctx?.getSlideElements() ?? []
    for (let i = 0; i < slides.length; i++) {
      const parallax = slides[i]?.querySelector('.carousel__parallax')
      if (!parallax) continue
      const layer = parallax.querySelector('.carousel__parallax__layer')
      if (layer) {
        while (layer.firstChild) slides[i].appendChild(layer.firstChild)
      }
      parallax.remove()
    }
    layers = []
  }

  /**
   * Get current visual position (accounts for CSS transition interpolation).
   * @returns {number}
   */
  function getVisualPosition() {
    if (!ctx) return 0
    if (ctx.isLoop()) return ctx.getPosition()

    // Non-loop: CSS transition interpolates transform, read computed value
    const track = ctx.getTrack()
    if (!track) return 0
    const cs = getComputedStyle(track)
    if (!cs.transform || cs.transform === 'none') return 0
    const m = new DOMMatrix(cs.transform)
    return -m.m41
  }

  function update() {
    if (!ctx) { running = false; rafId = 0; return }
    const step = ctx.getStep()
    if (step <= 0) {
      if (running) rafId = requestAnimationFrame(update)
      return
    }

    const engine = ctx.getLoopEngine()
    const pos = getVisualPosition()
    const count = layers.length

    for (let i = 0; i < layers.length; i++) {
      if (!layers[i]) continue
      const slide = ctx.getSlideElement(i)
      if (!slide) continue

      let diffToTarget
      if (engine) {
        // Loop: read slide's computed transform for its visual position
        const cs = getComputedStyle(slide)
        if (!cs.transform || cs.transform === 'none') { layers[i].style.transform = ''; continue }
        const m = new DOMMatrix(cs.transform)
        diffToTarget = m.m41 / step / count
      } else {
        // Non-loop: normalized distance from viewport
        diffToTarget = (i * step - pos) / step / count
      }

      const translate = diffToTarget * (-1 * tweenFactor) * 100
      layers[i].style.transform = `translateX(${translate}%)`
    }

    if (running) {
      rafId = requestAnimationFrame(update)
    } else {
      rafId = 0
    }
  }

  /** Start the rAF loop (idempotent). */
  function startLoop() {
    if (running) return
    running = true
    rafId = requestAnimationFrame(update)
  }

  /** Stop the rAF loop and run one final update to settle. */
  function stopLoop() {
    running = false
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    // One final frame to land at exact position
    update()
  }

  return {
    name: 'parallax',

    install(context) {
      ctx = context
      wrapSlides()

      // Initial position (single frame)
      update()

      unsubs.push(
        // Slide/fade transitions
        context.on('transition:start', startLoop),
        context.on('transition:end', stopLoop),
        // Rebuild after breakpoint change — rewrap new DOM elements
        context.on('resize', () => {
          if (!ctx) return
          wrapSlides()
          update()
        }),
      )

      // Intercept setPositionDrag for swipe support:
      // The swipe plugin calls setPositionDrag on every pointermove.
      // We hook into pointer events on the viewport to drive the rAF loop during drag.
      const viewport = context.getViewport()
      if (viewport) {
        const onPointerDown = () => startLoop()
        const onPointerUp = () => {
          // Small delay: let snapBack/goToAfterDrag start transition:start before we stop
          requestAnimationFrame(() => {
            if (!running) return
            // If transition:start already fired, it will keep the loop running.
            // Otherwise stop.
            stopLoop()
          })
        }
        viewport.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerUp)

        unsubs.push(() => {
          viewport.removeEventListener('pointerdown', onPointerDown)
          window.removeEventListener('pointerup', onPointerUp)
          window.removeEventListener('pointercancel', onPointerUp)
        })
      }
    },

    destroy() {
      running = false
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      unsubs.forEach(fn => fn())
      unsubs = []
      unwrapSlides()
      ctx = null
    },
  }
}

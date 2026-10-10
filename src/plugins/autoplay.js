/**
 * Autoplay plugin — auto-advance synchronized with animation.
 * Uses setTimeout chained after transition:end (not setInterval).
 *
 * @param {object} [options]
 * @param {number} [options.interval=3000]
 * @param {boolean} [options.pauseOnHover=true]
 * @param {boolean} [options.pauseOnInteraction=true]
 * @returns {import('../types').CarouselPlugin}
 */
export function createAutoplay(options = {}) {
  let ctx = null
  let unsubs = []
  let timer = null
  let active = false
  let paused = false
  let autoplayTriggered = false
  let autoNavigationStarted = false

  const interval = options.interval ?? 3000
  const pauseOnHover = options.pauseOnHover ?? true
  const pauseOnInteraction = options.pauseOnInteraction ?? true
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new RangeError('Carousel autoplay interval must be a positive number')
  }
  if (typeof pauseOnHover !== 'boolean' || typeof pauseOnInteraction !== 'boolean') {
    throw new TypeError('Carousel autoplay pause options must be booleans')
  }

  /** @type {(() => void) | null} */
  let onEnter = null
  /** @type {(() => void) | null} */
  let onLeave = null

  function scheduleNext() {
    clearTimeout(timer)
    if (!active || paused) return
    timer = setTimeout(() => {
      timer = null
      if (!active || paused) return
      const count = ctx?.getSlideCount() ?? 0
      const maxIndex = Math.max(0, Math.ceil(count - (ctx?.getSlidesPerView() ?? 1)))
      if (count <= 1 || (!ctx?.isLoop() && (ctx?.getIndex() ?? 0) >= maxIndex)) {
        active = false
        timer = null
        autoplayTriggered = false
        ctx?.emit('autoplay:stop')
        return
      }
      autoNavigationStarted = false
      autoplayTriggered = true
      try {
        ctx?.next()
      } finally {
        // If navigation was locked/no-op, no transition:end will arrive.
        autoplayTriggered = false
        if (active && !paused && !autoNavigationStarted) scheduleNext()
      }
    }, interval)
  }

  return {
    name: 'autoplay',

    install(context) {
      ctx = context
      const root = context.getRoot()

      if (pauseOnHover && root) {
        onEnter = () => { paused = true; clearTimeout(timer) }
        onLeave = () => { paused = false; if (active) scheduleNext() }
        root.addEventListener('mouseenter', onEnter)
        root.addEventListener('mouseleave', onLeave)
      }

      unsubs.push(
        context.on('transition:end', () => {
          if (active && !paused) scheduleNext()
        }),
        // A rebuild can cancel the current transition without transition:end.
        context.on('resize', () => {
          if (active && !paused) scheduleNext()
        }),
        context.on('slide:beforeChange', () => {
          if (autoplayTriggered) autoNavigationStarted = true
          else if (pauseOnInteraction && active) this.stop()
        }),
      )

      this.start()
    },

    destroy() {
      this.stop()
      unsubs.forEach(fn => fn())
      unsubs = []
      const root = ctx?.getRoot()
      if (root) {
        if (onEnter) root.removeEventListener('mouseenter', onEnter)
        if (onLeave) root.removeEventListener('mouseleave', onLeave)
      }
      onEnter = null
      onLeave = null
      ctx = null
    },

    start() {
      if (active) {
        if (ctx && !paused && timer === null) scheduleNext()
        return
      }
      active = true
      paused = false
      autoplayTriggered = false
      scheduleNext()
      ctx?.emit('autoplay:start')
    },

    stop() {
      if (!active) return
      active = false
      clearTimeout(timer)
      timer = null
      ctx?.emit('autoplay:stop')
    },

    toggle() {
      if (active) this.stop()
      else this.start()
    },

    isActive() { return active },
  }
}

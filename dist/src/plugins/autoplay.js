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
      autoplayTriggered = true
      try {
        ctx?.next()
      } finally {
        // slide:beforeChange is synchronous and observes the true value above.
        // If navigation was locked/no-op, do not leak that marker into the
        // next genuine user interaction.
        autoplayTriggered = false
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

      // After each animation ends, schedule next
      unsubs.push(
        context.on('transition:end', () => {
          if (active && !paused) scheduleNext()
        }),
      )

      // Detect user interaction (not autoplay)
      if (pauseOnInteraction) {
        unsubs.push(
          context.on('slide:beforeChange', () => {
            if (!autoplayTriggered && active) {
              this.stop()
            }
            autoplayTriggered = false
          }),
        )
      }

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
      if (active) return
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

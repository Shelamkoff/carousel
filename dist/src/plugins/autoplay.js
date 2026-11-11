import { getLastSlideIndex } from '../navigation.js'

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
  let installed = false
  let active = false
  let paused = false
  let autoplayTriggered = false
  let autoNavigationStarted = false
  const heldPointers = new Set()
  let onPointerDown = null
  let onPointerEnd = null
  let eventWindow = null

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
    if (!installed || !active || paused || heldPointers.size > 0) return
    timer = setTimeout(() => {
      timer = null
      if (!installed || !active || paused || heldPointers.size > 0) return
      const count = ctx?.getSlideCount() ?? 0
      const maxIndex = getLastSlideIndex(count, ctx?.getSlidesPerView() ?? 1)
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
      installed = true
      const root = context.getRoot()

      if (pauseOnHover && root) {
        onEnter = () => { paused = true; clearTimeout(timer); timer = null }
        onLeave = () => { paused = false; if (active) scheduleNext() }
        root.addEventListener('mouseenter', onEnter)
        root.addEventListener('mouseleave', onLeave)
      }

      // Pointer interaction may cancel an in-flight carousel transition,
      // which has no transition:end event to restart the autoplay timer.
      // Stop on interaction when configured, otherwise suspend the timer
      // until the user releases/cancels their pointer.
      const viewport = context.getViewport?.()
      if (viewport) {
        eventWindow = viewport.ownerDocument?.defaultView ?? window
        onPointerDown = event => {
          if (pauseOnInteraction) {
            this.stop()
          } else {
            heldPointers.add(event.pointerId)
            clearTimeout(timer)
            timer = null
          }
        }
        onPointerEnd = event => {
          if (!heldPointers.delete(event.pointerId) || heldPointers.size > 0) return
          if (active && !paused) scheduleNext()
        }
        viewport.addEventListener('pointerdown', onPointerDown)
        eventWindow.addEventListener('pointerup', onPointerEnd)
        eventWindow.addEventListener('pointercancel', onPointerEnd)
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
      // Keep the stop notification, but do not allow it to restart retired work.
      installed = false
      this.stop()
      unsubs.forEach(fn => fn())
      unsubs = []
      const root = ctx?.getRoot()
      if (root) {
        if (onEnter) root.removeEventListener('mouseenter', onEnter)
        if (onLeave) root.removeEventListener('mouseleave', onLeave)
      }
      const viewport = ctx?.getViewport?.()
      if (viewport && onPointerDown) viewport.removeEventListener('pointerdown', onPointerDown)
      if (onPointerEnd) {
        eventWindow?.removeEventListener('pointerup', onPointerEnd)
        eventWindow?.removeEventListener('pointercancel', onPointerEnd)
      }
      eventWindow = null
      heldPointers.clear()
      onPointerDown = null
      onPointerEnd = null
      onEnter = null
      onLeave = null
      ctx = null
    },

    start() {
      if (!installed) return
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

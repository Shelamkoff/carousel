/**
 * Swipe plugin — position-first drag.
 *
 * pointerdown on viewport, pointermove/up on window (captures fast drags).
 * Uses setPositionDrag (lightweight, no timer cancellation) during drag.
 *
 * @param {object} [options]
 * @param {number} [options.threshold=50]
 * @param {boolean} [options.mouse=false]
 * @param {number} [options.resistance=0.3]
 * @returns {import('../types').CarouselPlugin}
 */
export function createSwipe(options = {}) {
  let ctx = null
  /** @type {HTMLElement | null} */
  let viewport = null

  const threshold = options.threshold ?? 50
  const enableMouse = options.mouse ?? false
  const resistance = options.resistance ?? 0.3
  if (typeof enableMouse !== 'boolean') {
    throw new TypeError('Carousel swipe mouse must be a boolean')
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError('Carousel swipe threshold must be a non-negative number')
  }
  if (!Number.isFinite(resistance) || resistance < 0 || resistance > 1) {
    throw new RangeError('Carousel swipe resistance must be between 0 and 1')
  }
  const DEAD_ZONE = 5

  let startX = 0
  let startY = 0
  let startPosition = 0
  let dragging = false
  let trackMoved = false
  let directionDecided = false
  let cachedLoop = false
  let cachedStep = 0
  let cachedN = 0
  let cachedPerView = 1
  let cachedPointerId = -1

  /** @type {((e: PointerEvent) => void) | null} */
  let onDown = null
  /** @type {((e: PointerEvent) => void) | null} */
  let onMove = null
  /** @type {((e: PointerEvent) => void) | null} */
  let onUp = null
  /** @type {((e: DragEvent) => void) | null} */
  let onDragStart = null
  let resizeUnsub = null
  /** @type {AbortController | null} */
  let abortController = null

  function cancelDrag() {
    if (!dragging) return
    dragging = false
    trackMoved = false
    directionDecided = false
    if (viewport && cachedPointerId >= 0) {
      try { viewport.releasePointerCapture(cachedPointerId) } catch (_) {}
    }
  }

  return {
    name: 'swipe',

    install(context) {
      ctx = context
      viewport = context.getViewport()
      if (!viewport) return

      onDown = /** @param {PointerEvent} e */ (e) => {
        if (!enableMouse && e.pointerType === 'mouse') return
        if (e.button !== 0) return
        if (dragging || (e.pointerType === 'touch' && !e.isPrimary)) return
        if (/** @type {HTMLElement} */ (e.target).closest('.carousel__arrow, .carousel__dot, .carousel__thumb')) return

        // Take over: grab current position, stop animation cleanly
        startPosition = context.getPosition()
        // Cancel rAF/timers but DON'T re-render (slides already in correct position from last rAF frame)
        context.stopAnimation()

        dragging = true
        trackMoved = false
        directionDecided = false
        startX = e.clientX
        startY = e.clientY
        cachedPointerId = e.pointerId
        cachedLoop = context.isLoop()
        cachedStep = context.getStep()
        cachedN = context.getSlideCount()
        cachedPerView = context.getSlidesPerView()

        viewport?.setPointerCapture(e.pointerId)
      }

      onMove = /** @param {PointerEvent} e */ (e) => {
        if (!dragging || e.pointerId !== cachedPointerId) return

        const dx = e.clientX - startX
        const dy = e.clientY - startY

        // Dead zone: don't decide direction until 5px of movement
        if (!directionDecided) {
          if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return
          directionDecided = true
          if (Math.abs(dy) > Math.abs(dx)) { cancelDrag(); return }
        }

        trackMoved = true
        e.preventDefault()

        let newPos = startPosition - dx

        if (!cachedLoop) {
          const maxPos = Math.max(0, cachedN - cachedPerView) * cachedStep
          if (newPos < 0) newPos = newPos * resistance
          else if (newPos > maxPos) newPos = maxPos + (newPos - maxPos) * resistance
        }

        // Lightweight: only updates position + renders, no timer cleanup
        context.setPositionDrag(newPos)
      }

      onUp = /** @param {PointerEvent} e */ (e) => {
        if (!dragging || e.pointerId !== cachedPointerId) return
        dragging = false

        if (viewport && cachedPointerId >= 0) {
          try { viewport.releasePointerCapture(cachedPointerId) } catch (_) {}
        }

        if (!trackMoved) return

        const dx = e.clientX - startX

        if (Math.abs(dx) < threshold || cachedStep <= 0) {
          context.snapBack()
          return
        }

        const currentIdx = context.getIndex()
        const pos = context.getPosition()
        const engine = context.getLoopEngine()
        const perScroll = context.getSlidesPerScroll()
        let targetIdx

        if (engine) {
          targetIdx = engine.toIndex(pos)
        } else {
          targetIdx = Math.round(pos / cachedStep)
          const maxIdx = Math.max(0, Math.ceil(cachedN - cachedPerView))
          targetIdx = Math.max(0, Math.min(targetIdx, maxIdx))
        }

        if (perScroll > 1) {
          // ±1 page from START position (not current drag position)
          // dx < 0 = swiped left = next page. dx > 0 = swiped right = prev page.
          const startIdx = cachedLoop
            ? context.getLoopEngine().toIndex(startPosition)
            : Math.round(startPosition / cachedStep)
          const startPage = Math.round(startIdx / perScroll)
          const targetPage = dx < 0 ? startPage + 1 : startPage - 1

          if (cachedLoop) {
            const totalPages = Math.ceil(cachedN / perScroll)
            targetIdx = ((targetPage % totalPages + totalPages) % totalPages) * perScroll
          } else {
            const maxIdx = Math.max(0, Math.ceil(cachedN - cachedPerView))
            targetIdx = Math.max(0, Math.min(targetPage * perScroll, maxIdx))
          }
        } else {
          if (targetIdx === currentIdx) {
            if (dx < 0) {
              targetIdx = cachedLoop ? (currentIdx + 1) % cachedN : Math.min(currentIdx + 1, Math.max(0, Math.ceil(cachedN - cachedPerView)))
            } else {
              targetIdx = cachedLoop ? (currentIdx - 1 + cachedN) % cachedN : Math.max(currentIdx - 1, 0)
            }
          }
        }

        if (targetIdx === currentIdx) {
          context.snapBack()
          return
        }

        context.goToAfterDrag(targetIdx)
      }

      // AbortController: all listeners cleaned up on signal abort (destroy or DOM removal)
      abortController = new AbortController()
      const signal = abortController.signal

      // pointerdown on viewport, move/up on WINDOW (captures fast drags outside viewport)
      viewport.addEventListener('pointerdown', onDown, { signal })
      window.addEventListener('pointermove', onMove, { signal })
      window.addEventListener('pointerup', onUp, { signal })
      window.addEventListener('pointercancel', onUp, { signal })

      viewport.style.touchAction = 'pan-y pinch-zoom'
      onDragStart = e => e.preventDefault()
      viewport.addEventListener('dragstart', onDragStart, { signal })

      resizeUnsub = context.on('resize', cancelDrag)
    },

    destroy() {
      cancelDrag()
      resizeUnsub?.()
      resizeUnsub = null
      // Abort all listeners at once (viewport + window)
      abortController?.abort()
      abortController = null
      viewport = null
      onDown = null
      onMove = null
      onUp = null
      onDragStart = null
      ctx = null
    },
  }
}

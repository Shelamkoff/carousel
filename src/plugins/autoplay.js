import { getLastSlideIndex } from '../navigation.js'

/**
 * One deadline owns both auto-advance and the public progress snapshot.
 * Temporary suspension and stop/start preserve the remaining display time;
 * navigation starts a fresh interval only after its transition settles.
 * @param {object} [options]
 * @param {number} [options.interval=3000]
 * @param {boolean} [options.pauseOnHover=true]
 * @param {boolean} [options.pauseOnInteraction=true]
 * @param {boolean} [options.pauseOnFocus=true]
 * @returns {import('./autoplay').AutoplayPlugin}
 */
export function createAutoplay(options = {}) {
  const interval = options.interval ?? 3000
  const pauseOnHover = options.pauseOnHover ?? true
  const pauseOnInteraction = options.pauseOnInteraction ?? true
  const pauseOnFocus = options.pauseOnFocus ?? true
  // Native setTimeout converts larger delays to a near-immediate callback.
  if (!Number.isFinite(interval) || interval <= 0 || interval > 2147483647) {
    throw new RangeError('Carousel autoplay interval must be greater than 0 and at most 2147483647 milliseconds')
  }
  if ([pauseOnHover, pauseOnInteraction, pauseOnFocus].some(value => typeof value !== 'boolean')) {
    throw new TypeError('Carousel autoplay pause options must be booleans')
  }

  let ctx = null
  let unsubs = []
  let removers = []
  let eventWindow = null
  let timer = null
  let timerVersion = 0
  let deadline = null
  let remaining = interval
  let installed = false
  let active = false
  let transitioning = false
  let hovered = false
  let focused = false
  let hidden = false
  let ignoreHover = false
  let ignoreFocus = false
  let autoplayTriggered = false
  let autoNavigationStarted = false
  let lastIndex = 0
  let lastCount = 0
  let transitionUnsub = null
  let pointerReleaseVersion = 0
  const heldPointers = new Set()

  const now = () => eventWindow?.performance?.now?.() ?? globalThis.performance.now()
  const readRemaining = () => deadline === null ? remaining : Math.max(0, deadline - now())
  const suspended = () => transitioning || hidden || heldPointers.size > 0
    || (hovered && !ignoreHover) || (focused && !ignoreFocus)

  function getState() {
    const time = Math.max(0, Math.min(interval, readRemaining()))
    return Object.freeze({
      available: installed,
      active,
      paused: active && suspended(),
      running: installed && active && timer !== null,
      interval,
      remaining: time,
      progress: 1 - time / interval,
    })
  }

  function publish() { ctx?.emit('autoplay:state', getState()) }

  function cancelTimer(preserve = true) {
    if (preserve) remaining = readRemaining()
    ++timerVersion
    if (timer !== null) {
      const clear = eventWindow?.clearTimeout?.bind(eventWindow) ?? clearTimeout
      clear(timer)
    }
    timer = null
    deadline = null
  }

  function canAdvance() {
    if (!ctx) return false
    const count = ctx.getSlideCount()
    if (count <= 1) return false
    if (ctx.isLoop()) return (ctx.getSlidesPerScroll?.() ?? 1) % count !== 0
    return ctx.getIndex() < getLastSlideIndex(count, ctx.getSlidesPerView())
  }

  function schedule() {
    if (!installed || !active || suspended() || timer !== null) return
    if (!canAdvance()) {
      stop()
      return
    }
    // An exhausted interval (e.g. a stopped timer callback) gets one new turn.
    if (remaining <= 0) remaining = interval
    const owner = ctx
    const version = ++timerVersion
    deadline = now() + remaining
    const set = eventWindow?.setTimeout?.bind(eventWindow) ?? setTimeout
    timer = set(() => {
      if (!installed || ctx !== owner || version !== timerVersion) return
      timer = null
      deadline = null
      remaining = 0
      if (!active || suspended()) { publish(); return }
      if (!canAdvance()) { stop(); return }
      autoNavigationStarted = false
      autoplayTriggered = true
      try {
        owner.next()
      } finally {
        autoplayTriggered = false
        // Locked/no-op navigation emits no completion event. Retry with one
        // complete interval, without leaving a hot zero-delay timer behind.
        if (installed && ctx === owner && active && !autoNavigationStarted) {
          remaining = interval
          schedule()
          publish()
        }
      }
    }, remaining)
  }

  function suspendOrResume() {
    if (suspended()) cancelTimer()
    else schedule()
    publish()
  }

  function stopWatchingTransition() {
    const unsubscribe = transitionUnsub
    transitionUnsub = null
    unsubscribe?.()
  }

  function syncTransition(owner) {
    stopWatchingTransition()
    transitioning = owner.getRenderState()?.phase === 'animation'
    if (transitioning) {
      // A snapback has no transition:end. Watch the shared frame only until
      // this motion settles; ordinary idle playback keeps its O(1) deadline.
      transitionUnsub = owner.on('render', frame => {
        if (!installed || ctx !== owner || frame.phase === 'animation') return
        stopWatchingTransition()
        transitioning = false
        suspendOrResume()
      })
    }
  }

  function stop() {
    if (!active) return
    cancelTimer()
    active = false
    const owner = ctx
    owner?.emit('autoplay:stop')
    // A stop listener may explicitly start again; report its final state.
    if (ctx === owner) publish()
  }

  function start(explicit = true) {
    if (!installed) return
    if (!active && !canAdvance()) {
      if (!explicit) publish()
      return
    }
    const wasPaused = suspended()
    const wasRunning = timer !== null
    if (explicit) {
      // A keyboard or pointer user must be able to press Play while the
      // control is focused/hovered. The next entry or focus move pauses again.
      ignoreHover = hovered
      ignoreFocus = focused
    }
    const wasActive = active
    active = true
    const owner = ctx
    schedule()
    if (!wasActive && active && installed && ctx === owner) owner.emit('autoplay:start')
    if (ctx === owner && (!wasActive || wasPaused !== suspended() || wasRunning !== (timer !== null))) publish()
  }

  function listen(target, event, handler) {
    if (!target?.addEventListener) return
    target.addEventListener(event, handler)
    removers.push(() => target.removeEventListener(event, handler))
  }

  const plugin = {
    name: 'autoplay',

    install(context) {
      ctx = context
      installed = true
      active = false
      transitioning = false
      remaining = interval
      deadline = null
      ignoreHover = ignoreFocus = false
      ++pointerReleaseVersion
      heldPointers.clear()
      const root = context.getRoot()
      const viewport = context.getViewport?.()
      const document = root?.ownerDocument ?? viewport?.ownerDocument
      eventWindow = document?.defaultView ?? globalThis.window ?? null
      hidden = document?.hidden === true
      hovered = pauseOnHover && !!root?.matches?.(':hover')
      focused = pauseOnFocus && !!root?.contains?.(document?.activeElement)
      lastIndex = context.getIndex()
      lastCount = context.getSlideCount()

      if (pauseOnHover) {
        listen(root, 'mouseenter', () => {
          hovered = true
          ignoreHover = false
          suspendOrResume()
        })
        listen(root, 'mouseleave', () => {
          hovered = false
          ignoreHover = false
          suspendOrResume()
        })
      }
      if (pauseOnFocus) {
        listen(root, 'focusin', () => {
          focused = true
          ignoreFocus = false
          suspendOrResume()
        })
        listen(root, 'focusout', event => {
          if (root?.contains?.(event.relatedTarget)) return
          focused = false
          ignoreFocus = false
          suspendOrResume()
        })
      }
      listen(document, 'visibilitychange', () => {
        hidden = document.hidden === true
        suspendOrResume()
      })

      listen(viewport, 'pointerdown', event => {
        const path = event.composedPath?.() ?? [event.target]
        if (path.some(node => node?.classList?.contains?.('carousel__controls'))
          || event.target?.closest?.('.carousel__controls')) return
        // The held pointer suspends playback while swipe may cancel motion.
        // Its actual outcome is reconciled after every release handler runs.
        transitioning = false
        if (pauseOnInteraction) stop()
        else {
          heldPointers.add(event.pointerId)
          suspendOrResume()
        }
      })
      const releasePointer = event => {
        if (!heldPointers.delete(event.pointerId)) return
        if (typeof context.getRenderState !== 'function') {
          suspendOrResume()
          return
        }
        const owner = ctx
        const version = ++pointerReleaseVersion
        queueMicrotask(() => {
          if (!installed || ctx !== owner || version !== pointerReleaseVersion) return
          syncTransition(owner)
          suspendOrResume()
        })
      }
      listen(eventWindow, 'pointerup', releasePointer)
      listen(eventWindow, 'pointercancel', releasePointer)

      unsubs.push(
        context.on('slide:beforeChange', () => {
          stopWatchingTransition()
          cancelTimer(false)
          remaining = interval
          transitioning = true
          if (autoplayTriggered) autoNavigationStarted = true
          else if (pauseOnInteraction && active) { stop(); return }
          publish()
        }),
        context.on('transition:end', () => {
          stopWatchingTransition()
          cancelTimer(false)
          remaining = interval
          transitioning = false
          lastIndex = context.getIndex()
          lastCount = context.getSlideCount()
          schedule()
          publish()
        }),
        context.on('resize', () => {
          stopWatchingTransition()
          // Resizing/rebuilding may cancel the transition. A pure size change
          // preserves the countdown; changed content/index gets a new period.
          const reset = transitioning || context.getIndex() !== lastIndex
            || context.getSlideCount() !== lastCount
          cancelTimer(!reset)
          if (reset) remaining = interval
          transitioning = false
          lastIndex = context.getIndex()
          lastCount = context.getSlideCount()
          schedule()
          publish()
        }),
      )
      if (typeof context.getRenderState === 'function') syncTransition(context)
      start(false)
    },

    destroy() {
      if (!installed && !ctx) return
      const owner = ctx
      const wasActive = active
      installed = false
      active = false
      ++pointerReleaseVersion
      stopWatchingTransition()
      cancelTimer()
      const retiredUnsubs = unsubs
      const retiredRemovers = removers
      unsubs = []
      removers = []
      retiredUnsubs.forEach(remove => remove())
      retiredRemovers.forEach(remove => remove())
      heldPointers.clear()
      transitioning = false
      hovered = focused = hidden = false
      ignoreHover = ignoreFocus = false
      autoplayTriggered = autoNavigationStarted = false
      eventWindow = null
      ctx = null
      const state = getState()
      // Keep teardown notifications, after retiring resources. Callbacks
      // cannot restart this owner, and a new installation is left untouched.
      if (wasActive) owner?.emit('autoplay:stop')
      owner?.emit('autoplay:state', state)
    },

    start() { start() },
    stop,
    toggle() { if (active) stop(); else start() },
    isActive() { return active },
    getState,
  }
  return plugin
}

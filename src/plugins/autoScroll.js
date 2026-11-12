function validateMotion(speed, direction) {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError('Carousel autoscroll speed must be positive and finite')
  }
  if (direction !== 'forward' && direction !== 'backward') {
    throw new TypeError('Carousel autoscroll direction must be forward or backward')
  }
}

/**
 * Continuous gallery movement. The core owns the only animation frame; this
 * plugin owns playback intent and suspension, never a second position clock.
 * @param {import('./autoScroll.js').AutoScrollOptions} [options]
 * @returns {import('./autoScroll.js').AutoScrollPlugin}
 */
export function createAutoScroll(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Carousel autoscroll options must be an object')
  }
  let speed = options.speed ?? 40
  let direction = options.direction ?? 'forward'
  validateMotion(speed, direction)
  const autoStart = options.autoStart ?? true
  const pauseOnHover = options.pauseOnHover ?? true
  const pauseOnFocus = options.pauseOnFocus ?? true
  const pauseOnInteraction = options.pauseOnInteraction ?? false
  const respectReducedMotion = options.respectReducedMotion ?? true
  if ([autoStart, pauseOnHover, pauseOnFocus, pauseOnInteraction, respectReducedMotion]
    .some(value => typeof value !== 'boolean')) {
    throw new TypeError('Carousel autoscroll playback options must be booleans')
  }

  let ctx = null
  let installed = false
  let active = false
  let motion = null
  let hovered = false
  let focused = false
  let hidden = false
  let reducedMotion = false
  let ignoreHover = false
  let ignoreFocus = false
  let revision = 0
  let pending = null
  let lastPublished = null
  let removers = []
  const pointers = new Set()
  const suspended = () => hidden || reducedMotion || pointers.size > 0
    || hovered && !ignoreHover || focused && !ignoreFocus

  function getState() {
    const running = installed && active && !!motion?.isRunning()
    return Object.freeze({ available: installed, active, paused: active && !running,
      running, speed, direction, reducedMotion })
  }

  function publish() {
    const state = getState()
    if (lastPublished && Object.keys(state).every(key => state[key] === lastPublished[key])) return
    lastPublished = state
    ctx?.emit('autoscroll:state', state)
  }

  function retireMotion() {
    const retired = motion
    motion = null
    retired?.stop()
  }

  function reconcile(retry = true) {
    if (!installed) return
    const owner = ctx
    const version = revision
    if (motion && !motion.isRunning()) motion = null
    if (!active || suspended()) retireMotion()
    else if (!motion) {
      const next = owner.startContinuousScroll(direction === 'forward' ? speed : -speed)
      // Starting publishes a render frame; user callbacks may stop, remove,
      // reinstall or reconfigure this plugin before its handle is returned.
      if (ctx !== owner || !installed || revision !== version || !active || suspended()) next?.stop()
      else {
        motion = next
        // A public start/update can run inside a render or lifecycle callback.
        // Retry once outside that batch, without polling finite edges or locks.
        if (!next && retry) schedule()
      }
    }
    if (ctx === owner && installed && revision === version) publish()
  }

  function schedule() {
    if (!installed || pending) return
    const request = pending = { owner: ctx }
    queueMicrotask(() => {
      if (pending !== request) return
      pending = null
      if (installed && ctx === request.owner) reconcile(false)
    })
  }

  function start() {
    if (!installed) return
    ++revision
    active = true
    // A Play control inside the carousel remains usable by mouse/keyboard.
    // A new hover/focus entry suspends movement again.
    ignoreHover = hovered
    ignoreFocus = focused
    reconcile()
  }

  function stop() {
    ++revision
    active = false
    retireMotion()
    publish()
  }

  function listen(target, event, callback) {
    if (!target?.addEventListener) return
    target.addEventListener(event, callback)
    removers.push(() => target.removeEventListener(event, callback))
  }

  return {
    name: 'autoscroll',
    install(context) {
      if (context.getPlugin?.('autoplay')) {
        throw new Error('Carousel: autoplay and autoscroll cannot run on the same carousel')
      }
      ctx = context
      installed = true
      active = autoStart
      ++revision
      pending = lastPublished = null
      motion = null
      ignoreHover = ignoreFocus = false
      pointers.clear()
      const root = context.getRoot()
      const viewport = context.getViewport()
      const document = root?.ownerDocument ?? viewport?.ownerDocument
      const view = document?.defaultView ?? globalThis.window
      const preference = view?.matchMedia?.('(prefers-reduced-motion: reduce)')
      hidden = document?.hidden === true
      hovered = pauseOnHover && !!root?.matches?.(':hover')
      focused = pauseOnFocus && !!root?.contains?.(document?.activeElement)
      reducedMotion = respectReducedMotion && preference?.matches === true

      if (pauseOnHover) {
        listen(root, 'mouseenter', () => { hovered = true; ignoreHover = false; reconcile() })
        listen(root, 'mouseleave', () => { hovered = false; ignoreHover = false; reconcile() })
      }
      if (pauseOnFocus) {
        listen(root, 'focusin', () => { focused = true; ignoreFocus = false; reconcile() })
        listen(root, 'focusout', event => {
          if (root.contains(event.relatedTarget)) return
          focused = false
          ignoreFocus = false
          reconcile()
        })
      }
      listen(document, 'visibilitychange', () => {
        hidden = document.hidden === true
        if (hidden) pointers.clear()
        reconcile()
      })
      if (respectReducedMotion) listen(preference, 'change', () => {
        reducedMotion = preference.matches
        reconcile()
      })
      listen(viewport, 'pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return
        pointers.add(event.pointerId)
        if (pauseOnInteraction) stop()
        else reconcile()
      })
      const release = event => {
        if (!pointers.delete(event.pointerId)) return
        // Swipe's release handler can start a snap-back/navigation, in either
        // installation order. Observe the final owner after all handlers run.
        schedule()
      }
      listen(view, 'pointerup', release)
      listen(view, 'pointercancel', release)
      listen(view, 'blur', () => { pointers.clear(); schedule() })
      removers.push(
        context.on('slide:beforeChange', () => {
          if (pauseOnInteraction) stop()
          else { retireMotion(); publish() }
        }),
        context.on('motion:idle', schedule),
        context.on('transition:end', schedule),
        context.on('resize', schedule),
        context.on('slides:change', schedule),
      )
      reconcile()
    },
    destroy() {
      if (!installed && !ctx) return
      const owner = ctx
      const retired = removers
      removers = []
      installed = active = false
      ++revision
      pending = null
      retired.forEach(remove => remove())
      retireMotion()
      pointers.clear()
      hovered = focused = hidden = reducedMotion = false
      ignoreHover = ignoreFocus = false
      ctx = null
      const state = getState()
      lastPublished = state
      owner?.emit('autoscroll:state', state)
    },
    start,
    stop,
    toggle() { if (active) stop(); else start() },
    isActive() { return active },
    getState,
    update(patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError('Carousel autoscroll update must be an object')
      }
      const nextSpeed = patch.speed === undefined ? speed : patch.speed
      const nextDirection = patch.direction === undefined ? direction : patch.direction
      validateMotion(nextSpeed, nextDirection)
      if (speed === nextSpeed && direction === nextDirection) return
      ++revision
      speed = nextSpeed
      direction = nextDirection
      retireMotion()
      reconcile()
    },
  }
}

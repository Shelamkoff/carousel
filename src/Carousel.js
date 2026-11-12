import { EventBus } from '@shelamkoff/event-bus'
import { SlideManager } from './SlideManager.js'
import { validateSlide, validateSlides } from './slideData.js'
import { DEFAULTS, validateResolvedOptions, validateOptionsTree } from './options.js'
import { createPluginScope } from './PluginScope.js'
import { createRenderState } from './renderState.js'
import { FadeTransition } from './transitions/FadeTransition.js'
import { TrackRenderer } from './TrackRenderer.js'
import { LoopEngine } from './LoopEngine.js'
import { BreakpointManager } from './BreakpointManager.js'
import { isHTMLElement } from './dom.js'
import { synchronous } from './synchronous.js'
import { getNavigationTarget, getPageTargets } from './navigation.js'
import { getLayoutSizing } from './layouts.js'
import { ViewportTransition, isViewportTransition } from './transitions/ViewportTransition.js'
import { SurfaceTransition, isSurfaceTransition } from './transitions/SurfaceTransition.js'

const ownedPluginInstances = new WeakSet()

/**
 * Position-first carousel.
 *
 * position = raw px, single source of truth.
 * Animation via requestAnimationFrame (no CSS transitions, no transitionend).
 * Loop slides use individual transforms, with inert visual copies for short loops.
 */
export class Carousel {
  #events = new EventBus()
  #slideManager
  #trackRenderer
  /** @type {LoopEngine | null} */
  #loop = null
  #geometry = null
  #breakpointManager
  #options
  #resolvedOptions
  /** @type {number} */
  #position = 0
  #animating = false
  #destroyed = false
  /** @type {number} */
  #rafId = 0
  /** @type {number} */
  #animationTimer = 0
  #fadeTransition = null
  /** @type {ViewportTransition | null} */
  #viewportTransition = null
  #container = null
  #prevIndex = 0
  #pendingResize = false
  /** @type {number | null} */
  #pendingResizeStep = null
  #plugins = new Map()
  #installingPluginNames = new Set()
  #navigationEpoch = 0
  #selectedIndex = 0
  #notifying = false
  #rebuilding = false
  #pendingSelection = null
  #queuedNavigation = null
  #focusHandler = null
  #focusRequest = null
  #renderState = null
  #renderSerial = 0
  #resetSerial = 0
  #activeReset = null
  #renderPhase = 'idle'
  #lastRenderPosition = 0
  #renderDirection = 0
  #transitionProgress = null
  #transitionDirection = 0
  #idleNotification = null
  #scrollMotion = null

  constructor(container, slides, options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Carousel: options must be an object')
    }
    if (options.breakpoints !== undefined
      && (!options.breakpoints || typeof options.breakpoints !== 'object' || Array.isArray(options.breakpoints))) {
      throw new TypeError('Carousel: breakpoints must be an object')
    }
    this.#container = typeof container === 'string'
      ? document.querySelector(container) : container
    if (!this.#container) throw new Error('Carousel: container not found')
    if (!isHTMLElement(this.#container)) throw new TypeError('Carousel: container must be an HTMLElement')
    validateSlides(slides)
    if (options.plugins !== undefined && !Array.isArray(options.plugins)) {
      throw new TypeError('Carousel: plugins must be an array')
    }

    validateOptionsTree({ ...DEFAULTS, ...options })
    this.#options = {
      ...DEFAULTS,
      ...options,
      breakpoints: options.breakpoints
        ? Object.fromEntries(Object.entries(options.breakpoints).map(([width, override]) => [width, { ...override }]))
        : undefined,
      plugins: options.plugins ? [...options.plugins] : undefined,
    }
    this.#slideManager = new SlideManager(slides)
    this.#trackRenderer = new TrackRenderer()
    this.#breakpointManager = new BreakpointManager(this.#options, this.#options.breakpoints, this.#container.ownerDocument?.defaultView ?? window)

    try {
      this.#resolvedOptions = validateResolvedOptions(this.#breakpointManager.resolve())
      this.#breakpointManager.onChange(() => this.#handleBreakpointChange())
      // During initial build consumers cannot subscribe yet, so the renderer
      // reports eager render failures to console. Later failures use events.
      this.#buildDOM()
      this.#trackRenderer.onRenderError((index, error) => {
        this.#events.emit('slide:error', { index, error })
      })
      this.#trackRenderer.onLayoutError((name, error) => {
        this.#dispatchEvents(() => this.#events.emit('layout:error', { name, error }))
      })
      this.#trackRenderer.onGeometryError((name, error) => {
        this.#dispatchEvents(() => this.#events.emit('geometry:error', { name, error }))
      })

      if (options.plugins) {
        for (const plugin of options.plugins) this.use(plugin)
      }
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  /* ═══════════════ DOM ═══════════════ */

  #trackLayout() {
    const opts = this.#resolvedOptions
    return {
      ...getLayoutSizing(opts),
      logicalSlidesPerView: opts.slidesPerView ?? 1,
      geometry: opts.geometry,
      gap: opts.gap ?? 0,
      loop: opts.loop ?? false,
      ariaLabel: opts.ariaLabel,
      orientation: opts.orientation,
      viewportHeight: opts.viewportHeight,
      keys: this.#slideManager.getKeys(),
      layout: opts.layout,
      expandRatio: opts.expandRatio,
      expandPeek: opts.expandPeek,
    }
  }

  #buildDOM() {
    const opts = this.#resolvedOptions
    this.#trackRenderer.build(this.#container, this.#slideManager.getSlides(), this.#trackLayout())
    this.#initLoop()
    const count = this.#slideManager.getSlideCount()
    const startIndex = opts.startIndex ?? 0
    this.#selectedIndex = count === 0
      ? 0
      : this.#loop
        ? startIndex % count
        : Math.min(startIndex, this.#maxIndex())
    this.#position = this.#geometry.indexToPosition(this.#selectedIndex, !!this.#loop)
    this.#render()

    this.#trackRenderer.onResize((previousSlideSize) => {
      const previousStep = previousSlideSize + this.#trackRenderer.gap
      if (this.#scrollMotion) {
        this.#applyResize(previousStep)
        return
      }
      if (this.#viewportTransition || this.#resolvedOptions.geometry) {
        // A responsive geometry change settles the pending destination and
        // retires the decorative panels before publishing the resized state.
        const targetIndex = this.#animating ? this.#selectedIndex : this.getIndex()
        const wasAnimating = this.#animating
        const epoch = this.#stopAllAnimations()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#pendingResize = true
        this.#pendingResizeStep = previousStep
        this.#selectedIndex = targetIndex
        if (wasAnimating) this.#onAnimationComplete()
        else this.#applyResize(previousStep, targetIndex)
        return
      }
      if (this.#animating) {
        this.#pendingResize = true
        this.#pendingResizeStep ??= previousStep
        return
      }
      this.#applyResize(previousStep)
    })

    // Native Tab/focus() can scroll an overflow:hidden viewport independently
    // of the position controller. Keep live controls reachable through the
    // carousel's navigation instead of making off-screen originals inert.
    this.#focusHandler = event => this.#revealFocusedSlide(event)
    this.#trackRenderer.getViewport()?.addEventListener('focusin', this.#focusHandler, true)
  }

  #revealFocusedSlide(event) {
    this.#focusRequest = null
    if (this.#destroyed) return
    const viewport = this.#trackRenderer.getViewport()
    const path = event.composedPath?.() ?? []
    if (!path.length) {
      for (let node = event.target; node; node = node.parentNode) {
        path.push(node)
        if (node === viewport) break
      }
    }
    // Inspect the composed path for editors inside Shadow DOM and for this
    // carousel's own slide when another carousel is nested inside its content.
    const focused = path[0]
    const slide = path.find(node => node?.dataset?.index !== undefined
      && this.#trackRenderer.getSlideElement(Number(node.dataset.index)) === node)
    if (typeof focused?.getBoundingClientRect !== 'function') return
    const request = { viewport, focused, slide }
    this.#focusRequest = request
    queueMicrotask(() => {
      if (this.#focusRequest !== request) return
      this.#focusRequest = null
      if (this.#destroyed || this.#trackRenderer.getViewport() !== viewport) return
      // Always clear native focus-scroll, including when a newer application
      // command superseded the requested reveal or focus left the slide.
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
      if (!slide || request.cancelled) return
      const current = () => !this.#destroyed
        && this.#trackRenderer.getViewport() === viewport
        && this.#trackRenderer.getSlideElement(Number(slide.dataset.index)) === slide
        && (focused.getRootNode?.() ?? focused.ownerDocument)?.activeElement === focused
      if (!current()) return

      // Wait until the browser's default focus-scroll has finished, then read
      // geometry in the carousel's unscrolled coordinate system. These reads
      // happen only on focus, never in the animation/drag frame loop.
      const bounds = viewport.getBoundingClientRect()
      const vertical = this.#resolvedOptions.orientation === 'vertical'
      const size = vertical ? 'height' : 'width'
      const start = vertical ? 'top' : 'left'
      const end = vertical ? 'bottom' : 'right'
      if (bounds[size] <= 0) return
      const control = focused.getBoundingClientRect()
      const outside = control[size] > bounds[size]
        ? control[end] <= bounds[start] || control[start] >= bounds[end]
        : control[start] < bounds[start] - 0.5 || control[end] > bounds[end] + 0.5
      // Focusing another already-visible slide must not move a settled
      // multi-slide page. An active transition is interrupted for stable focus.
      if (!outside && !this.#animating) return

      const epoch = this.#stopAllAnimations()
      if (!current() || this.#navigationEpoch !== epoch) return
      if (this.#pendingResize) {
        this.#applyResize(this.#pendingResizeStep ?? this.#step())
        if (!current() || this.#navigationEpoch !== epoch) return
      }
      this.#navigate(Number(slide.dataset.index), undefined, undefined, undefined, 0)
      if (current()) { viewport.scrollLeft = 0; viewport.scrollTop = 0 }
    })
  }

  /** @param {number} [previousStep] @param {number} [targetIndex] */
  #applyResize(previousStep = this.#step(), targetIndex) {
    const idx = targetIndex ?? this.getIndex()
    const logical = this.#scrollMotion ? this.#geometry.logicalPosition(this.#position, !!this.#loop) : null
    const epoch = this.#scrollMotion ? this.#stopAllAnimations() : this.#navigationEpoch
    if (this.#destroyed || this.#navigationEpoch !== epoch) return
    this.#pendingResize = false
    this.#pendingResizeStep = null
    const apply = () => {
      if (this.#resolvedOptions.geometry) {
        // Physical measurements may change both snap points and copy coverage.
        // Reconcile retained content after retiring any frame-owned styles.
        this.#resetRender()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        if (!this.#trackRenderer.refreshCopies()) return
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
      }
      this.#initLoop()
      this.#selectedIndex = idx
      this.#position = this.#geometry.indexToPosition(idx, !!this.#loop)
      if (logical !== null && this.#geometry.count) {
        // Keep the fractional location when responsive measurements change.
        // This also works for unequal physical distances between snap points.
        const lower = Math.min(Math.floor(logical), this.#geometry.count - 1)
        const start = this.#geometry.snapPoints[lower]
        const end = this.#geometry.snapPoints[lower + 1] ?? this.#geometry.loopLength
        this.#position = start + (end - start) * (logical - lower)
      }
      if (!this.#render()) return
      this.#selectedIndex = this.getIndex()
      this.#rebuilding = false
      this.#events.emit('resize', { slidesPerView: this.#resolvedOptions.slidesPerView ?? 1 })
    }
    if (this.#resolvedOptions.geometry) this.#dispatchEvents(apply, true)
    else apply()
  }

  /** @returns {number} resolved slidesPerScroll */
  #perScroll() {
    const raw = this.#resolvedOptions.slidesPerScroll ?? 1
    return raw === 'auto' ? Math.max(1, Math.floor(this.#resolvedOptions.slidesPerView ?? 1)) : raw
  }

  /** Respect reduced-motion preferences without changing configured durations. */
  #duration() {
    const view = this.#container?.ownerDocument?.defaultView ?? window
    return view.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 0
      : this.#resolvedOptions.transitionDuration ?? 400
  }

  #initLoop() {
    this.#geometry = this.#trackRenderer.getNavigationGeometry()
    const N = this.#slideManager.getSlideCount()
    if (this.#resolvedOptions.loop && N > 0) {
      this.#loop = new LoopEngine(this.#geometry)
    } else {
      this.#loop = null
    }
  }

  /** @returns {number} */
  #step() { return this.#trackRenderer.slideSize + this.#trackRenderer.gap }

  /**
   * Render position to DOM.
   * Loop: each slide positioned individually. Track stays at 0.
   * Non-loop: track moves, slides stay in flex flow.
   */
  #render(clamp = true, phase = this.#animating ? 'animation' : this.#scrollMotion ? 'scroll' : 'idle') {
    if (this.#destroyed) return false
    if (!this.#loop && clamp) {
      const maxPos = this.#trackRenderer.getNavigationGeometry()?.maxPosition ?? 0
      this.#position = Math.max(0, Math.min(this.#position, maxPos))
    }
    const epoch = this.#navigationEpoch
    let rendered = false
    this.#dispatchEvents(() => { rendered = this.#trackRenderer.renderPosition(this.#position, this.#loop) })
    if (rendered && !this.#destroyed && this.#navigationEpoch === epoch) this.#publishRenderState(phase)
    return rendered && !this.#destroyed && this.#navigationEpoch === epoch
  }

  #publishRenderState(phase = this.#animating ? 'animation' : this.#scrollMotion ? 'scroll' : 'idle') {
    if (this.#destroyed) return
    // Reconfiguration can clamp the selected slide to a new finite edge.
    // Publish that settled identity before callbacks cache the frame.
    if (phase === 'idle' || phase === 'scroll') this.#selectedIndex = this.getIndex()
    const delta = this.#position - this.#lastRenderPosition
    this.#renderDirection = phase === 'scroll' && this.#scrollMotion ? Math.sign(this.#scrollMotion.velocity)
      : Math.abs(delta) > 1e-9 ? Math.sign(delta)
      : phase === 'animation' ? this.#transitionDirection : 0
    this.#lastRenderPosition = this.#position
    this.#renderPhase = phase
    this.#renderState = null
    this.#renderSerial++
    if (this.#events.has('render')) {
      const state = this.getRenderState()
      this.#dispatchEvents(() => this.#events.emit('render', state))
    }
  }

  #resetRender(index) {
    const previous = this.#activeReset
    this.#activeReset = ++this.#resetSerial
    try {
      // A nested reset can retire the outer event before later plugins see
      // its scope. Escalate to a full reset so it also covers that outer work.
      if (index === undefined || previous !== null) this.#events.emit('render:reset')
      else this.#events.emit('render:reset', Object.freeze({ indices: Object.freeze([index]) }))
    }
    finally { this.#activeReset = previous }
  }

  /** Lazy, immutable snapshots keep the unobserved finite path constant-time. */
  getRenderState() {
    if (this.#destroyed) return null
    if (!this.#renderState) {
      const view = this.#container?.ownerDocument?.defaultView ?? window
      this.#renderState = createRenderState(this.#fadeTransition?.getSlots()
        ?? this.#trackRenderer.getRenderSlots(this.#position, this.#loop), {
        position: this.#position, step: this.#step(), viewportSize: this.#trackRenderer.viewportSize,
        orientation: this.#resolvedOptions.orientation, index: this.getIndex(),
        selectedIndex: this.#selectedIndex, fromIndex: this.#prevIndex,
        direction: this.#renderDirection, phase: this.#renderPhase,
        transitionProgress: this.#transitionProgress, revision: this.#trackRenderer.revision,
        reducedMotion: !!view.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      })
    }
    return this.#renderState
  }

  #handleBreakpointChange() {
    const oldIdx = this.#collectionIndex()
    const selection = this.#beginCollectionSelection(oldIdx)
    try {
      this.#dispatchEvents(() => {
        const epoch = this.#stopAllAnimations()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#pendingResize = false
        this.#pendingResizeStep = null
        this.#resolvedOptions = validateResolvedOptions(this.#breakpointManager.resolve())
        const opts = this.#resolvedOptions
        this.#resetRender()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#trackRenderer.rebuild(this.#slideManager.getSlides(), this.#trackLayout())
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#initLoop()
        this.#position = this.#geometry.indexToPosition(oldIdx, !!this.#loop)
        this.#selectedIndex = oldIdx
        this.#endCollectionSelection(selection)
        if (!this.#render()) return
        this.#selectedIndex = this.getIndex()
        this.#rebuilding = false
        this.#events.emit('resize', { slidesPerView: opts.slidesPerView ?? 1 })
      }, true)
    } finally { this.#endCollectionSelection(selection) }
  }

  /* ═══════════════ Animation ═══════════════ */

  /** Stop all running animations (rAF, CSS transition, fade). */
  #stopAllAnimations() {
    const wasMoving = this.#animating || this.#scrollMotion !== null || this.#renderPhase === 'drag'
    const epoch = ++this.#navigationEpoch
    if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = 0 }
    if (this.#animationTimer) { clearTimeout(this.#animationTimer); this.#animationTimer = 0 }
    this.#animating = false
    this.#scrollMotion = null
    this.#transitionProgress = null
    this.#transitionDirection = 0
    this.#renderState = null
    this.#renderPhase = 'idle'
    this.#renderDirection = 0
    if (wasMoving) this.#notifyMotionIdle('cancel')
    this.#cancelFade()
    if (this.#navigationEpoch !== epoch) return epoch
    this.#trackRenderer.stopAnimation()
    if (this.#viewportTransition) this.#destroyViewportTransition(this.#viewportTransition)
    return epoch
  }

  /**
   * Publish a settled motion boundary without constructing per-slide frames.
   * Cleanup, pointer handlers and callbacks can replace motion synchronously;
   * notify only once their final state is idle, never between two owners.
   */
  #notifyMotionIdle(reason) {
    if (this.#destroyed) return
    const notification = this.#idleNotification = { reason }
    const publish = () => {
      if (this.#idleNotification !== notification) return
      if (this.#destroyed || this.#animating || this.#renderPhase !== 'idle') {
        this.#idleNotification = null
        return
      }
      // stopAnimation() can run inside transition:start before that event
      // batch queues replacement navigation. Wait for the queue to drain;
      // a queued no-op must still allow the final cancellation to publish.
      if (this.#queuedNavigation) { queueMicrotask(publish); return }
      this.#idleNotification = null
      const payload = { index: this.getIndex(), position: this.#position, reason }
      this.#dispatchEvents(() => this.#events.emit('motion:idle', payload))
    }
    queueMicrotask(publish)
  }

  /** Constant physical velocity on the same owned clock as navigation. */
  #startContinuousScroll(velocity) {
    if (!Number.isFinite(velocity) || velocity === 0) {
      throw new RangeError('Carousel scroll velocity must be a nonzero finite number')
    }
    // A controller may request motion after an event settles. Never steal a
    // gesture, transition, another controller or an in-progress rebuild.
    if (this.#destroyed || this.#notifying || this.#animating || this.#scrollMotion
      || this.#renderPhase === 'drag' || this.#queuedNavigation) return null
    const geometry = this.#geometry
    if (!geometry?.count || geometry.viewportSize <= 0 || geometry.loopLength <= 0) return null
    if (!this.#loop && (velocity > 0 ? this.#position >= geometry.maxPosition : this.#position <= 0)) return null

    const motion = { velocity }
    const epoch = ++this.#navigationEpoch
    const current = () => !this.#destroyed && this.#scrollMotion === motion && this.#navigationEpoch === epoch
    const stop = (reason = 'cancel') => {
      if (!current()) return
      const stoppedEpoch = this.#stopAllAnimations()
      if (this.#destroyed || this.#navigationEpoch !== stoppedEpoch) return
      this.#publishRenderState('idle')
      if (!this.#destroyed && this.#navigationEpoch === stoppedEpoch) this.#notifyMotionIdle(reason)
    }
    this.#scrollMotion = motion
    this.#transitionProgress = null
    this.#prevIndex = this.getIndex()
    this.#publishRenderState('scroll')
    let previousTime = performance.now()
    const frame = now => {
      if (!current()) return
      // Read the live model inside the frame. A retained, stopped public handle
      // must not keep an obsolete collection's geometry arrays alive.
      const geometry = this.#geometry
      this.#rafId = 0
      // A stalled/hidden tab must not replay seconds of missed travel at once.
      const elapsed = Math.max(0, Math.min(100, now - previousTime))
      previousTime = now
      const previous = this.getIndex()
      this.#position += velocity * (elapsed / 1000)
      if (this.#loop) this.#position = geometry.normalize(this.#position)
      else this.#position = Math.max(0, Math.min(this.#position, geometry.maxPosition))
      const index = this.getIndex()
      if (index !== previous) this.#prevIndex = previous
      if (!this.#render() || !current()) return
      if (index !== previous) {
        const slide = this.#slideManager.getSlide(index)
        this.#dispatchEvents(() => this.#events.emit('slide:change', { index, prevIndex: previous, slide }))
        if (!current()) return
      }
      if (!this.#loop && (velocity > 0 ? this.#position >= geometry.maxPosition : this.#position <= 0)) {
        stop('complete')
        return
      }
      this.#rafId = requestAnimationFrame(frame)
    }
    if (current()) this.#rafId = requestAnimationFrame(frame)
    return Object.freeze({ isRunning: current, stop: () => stop() })
  }

  #destroyViewportTransition(transition) {
    // Retire shared ownership before user cleanup can reenter the carousel.
    if (this.#viewportTransition === transition) this.#viewportTransition = null
    try {
      this.#dispatchEvents(() => transition.destroy())
    } catch (error) {
      this.#reportTransitionError(transition.name, error)
    }
  }

  #reportTransitionError(name, error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    if (this.#destroyed) {
      console.error(`Carousel: transition "${name}" failed`, normalized)
      return
    }
    this.#dispatchEvents(() => this.#events.emit('transition:error', { name, error: normalized }))
  }

  #onAnimationComplete() {
    this.#animating = false
    const epoch = this.#navigationEpoch

    // Resize handlers are allowed to update/destroy the carousel.
    if (this.#pendingResize) {
      this.#pendingResize = false
      const previousStep = this.#pendingResizeStep ?? this.#step()
      this.#pendingResizeStep = null
      // A narrower layout may already have clamped the old pixel coordinate.
      // Completion preserves its logical destination instead of decoding it.
      this.#applyResize(previousStep, this.#selectedIndex)
    }
    if (this.#destroyed || this.#navigationEpoch !== epoch) return

    const idx = this.getIndex()
    this.#selectedIndex = idx
    this.#renderState = null
    this.#renderPhase = 'idle'
    this.#renderDirection = 0
    this.#transitionProgress = null
    const previous = this.#prevIndex
    const slide = this.#slideManager.getSlide(idx)
    this.#dispatchEvents(() => {
      this.#events.emit('transition:end', { index: idx })
      // A transition:end subscriber may synchronously mutate the slide list
      // or reconfigure the layout. Suppress the obsolete change notification.
      if (this.#destroyed || this.#navigationEpoch !== epoch) return
      this.#events.emit('slide:change', { index: idx, prevIndex: previous, slide })
    })
    // Zero-duration decorative transitions and failed factories can complete
    // directly, without entering the shared animation clock.
    if (!this.#destroyed && this.#navigationEpoch === epoch) this.#notifyMotionIdle('complete')
  }

  /**
   * Prevent callback-driven navigation from entering a transition before an
   * event batch or layout rebuild is complete. Nested batches share one queue.
   * @param {() => void} dispatch
   * @param {boolean} [rebuilding]
   */
  #dispatchEvents(dispatch, rebuilding = false) {
    const wasNotifying = this.#notifying
    const wasRebuilding = this.#rebuilding
    this.#notifying = true
    this.#rebuilding = wasRebuilding || rebuilding
    try {
      dispatch()
    } finally {
      this.#notifying = wasNotifying
      this.#rebuilding = wasRebuilding
      if (!wasNotifying) {
        const queued = this.#queuedNavigation
        if (queued && !this.#destroyed) {
          queueMicrotask(() => {
            if (this.#queuedNavigation !== queued) return
            this.#queuedNavigation = null
            if (queued.relativeDirection) this.#navigateRelative(queued.relativeDirection)
            else if (queued.snapBack) this.#animateSnapBack(queued.index, queued.durationOverride)
            else this.#navigate(queued.index, queued.direction, queued.fromIndex, queued.startPosition, queued.durationOverride)
          })
        }
      }
    }
  }

  /* ═══════════════ Plugins ═══════════════ */

  use(plugin) {
    if (this.#destroyed) throw new Error('Cannot install a plugin on a destroyed Carousel')
    if (!plugin || typeof plugin.name !== 'string' || !plugin.name.trim() || typeof plugin.install !== 'function') {
      throw new TypeError('Plugin must define a non-empty name and an install(context) function')
    }
    const name = plugin.name
    if (this.#plugins.has(name) || this.#installingPluginNames.has(name)) {
      throw new Error(`Plugin "${name}" already installed or installing`)
    }
    const otherPlayback = name === 'autoplay' ? 'autoscroll' : name === 'autoscroll' ? 'autoplay' : null
    if (otherPlayback && (this.#plugins.has(otherPlayback) || this.#installingPluginNames.has(otherPlayback))) {
      throw new Error('Carousel: autoplay and autoscroll cannot run on the same carousel')
    }
    if (ownedPluginInstances.has(plugin)) throw new Error(`Plugin "${name}" is already owned by another Carousel`)
    const { context: ctx, cleanup } = this.#createPluginContext()
    ownedPluginInstances.add(plugin)
    this.#installingPluginNames.add(name)
    try {
      synchronous(plugin.install(ctx), `plugin "${name}" install()`)
      // install() may synchronously call carousel.destroy().
      if (this.#destroyed) throw new Error(`Carousel was destroyed while installing plugin "${name}"`)
      this.#plugins.set(name, { plugin, context: ctx, cleanupContext: cleanup })
    } catch (error) {
      try { synchronous(plugin.destroy?.(), `plugin "${name}" destroy()`) }
      catch { /* preserve the installation error */ }
      cleanup()
      ownedPluginInstances.delete(plugin)
      throw error
    } finally {
      this.#installingPluginNames.delete(name)
    }
    return this
  }

  getPlugin(name) { return this.#plugins.get(name)?.plugin }

  unuse(name) {
    const entry = this.#plugins.get(name)
    if (!entry) return false
    this.#plugins.delete(name)
    try { synchronous(entry.plugin.destroy?.(), `plugin "${name}" destroy()`) }
    finally {
      entry.cleanupContext()
      ownedPluginInstances.delete(entry.plugin)
    }
    return true
  }

  #createPluginContext() {
    let scroll = null
    let closed = false
    const scope = createPluginScope(this.#events, {
      next: () => this.next(),
      prev: () => this.prev(),
      goTo: (i) => this.goTo(i),
      addSlide: (slide, i) => this.addSlide(slide, i),
      removeSlide: i => this.removeSlide(i),
      updateSlide: (i, patch) => this.updateSlide(i, patch),
      moveSlide: (from, to) => this.moveSlide(from, to),
      setSlides: slides => this.setSlides(slides),
      refresh: i => this.refresh(i),
      getRenderState: () => this.getRenderState(),
      goToAfterDrag: (i, startIndex, direction, startPosition) => {
        this.#navigate(i, direction, startIndex, startPosition)
      },
      snapBack: index => this.#animateSnapBack(index ?? this.getIndex(), this.#duration()),

      // Keep the rendered position unless a deferred layout has changed
      // its coordinate system. Gesture callers read their origin afterward.
      stopAnimation: () => {
        if (this.#destroyed) return
        const epoch = this.#stopAllAnimations()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        if (this.#pendingResize) {
          this.#applyResize(this.#pendingResizeStep ?? this.#step())
        }
      },

      getPosition: () => this.#position,
      startContinuousScroll: velocity => {
        const next = this.#startContinuousScroll(velocity)
        // The initial frame can synchronously remove this plugin before its
        // returned motion handle has been attached to the scope.
        if (closed) { next?.stop(); return null }
        if (next) scroll = next
        return next
      },
      setPosition: (pos) => {
        if (!Number.isFinite(pos)) throw new TypeError('Carousel position must be finite')
        if (this.#destroyed) return
        const epoch = this.#stopAllAnimations()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#position = pos
        this.#render()
      },
      // Lightweight: just update position + render. No timer/rAF cleanup.
      // Used during drag (60-120fps) where cleanup overhead matters.
      setPositionDrag: (pos) => {
        if (!Number.isFinite(pos)) throw new TypeError('Carousel drag position must be finite')
        if (this.#scrollMotion) this.#stopAllAnimations()
        if (this.#destroyed) return
        this.#position = pos
        this.#render(false, 'drag')
      },
      getStep: () => this.#step(),
      getLoopEngine: () => this.#loop,
      getNavigationGeometry: () => this.getNavigationGeometry(),
      getNavigationTarget: (direction, fromIndex = this.getIndex()) =>
        getNavigationTarget(this.#geometry, this.#resolvedOptions, fromIndex, direction),
      getPageTargets: (anchorIndex = 0) => getPageTargets(this.#geometry, this.#resolvedOptions, anchorIndex),
      getPlugin: name => this.getPlugin(name),

      getIndex: () => this.getIndex(),
      getRealIndex: () => this.getRealIndex(),
      getSlide: (i) => this.#slideManager.getSlide(i ?? this.getIndex()),
      getSlides: () => this.#slideManager.getSlides(),
      getSlideCount: () => this.#slideManager.getSlideCount(),
      getSlidesPerView: () => this.#resolvedOptions.slidesPerView ?? 1,
      getSlidesPerScroll: () => this.#perScroll(),
      isLoop: () => this.#resolvedOptions.loop ?? false,

      options: new Proxy({}, {
        get: (_, key) => this.#resolvedOptions[key],
        ownKeys: () => Reflect.ownKeys(this.#resolvedOptions),
        getOwnPropertyDescriptor: (_, key) => Object.prototype.hasOwnProperty.call(this.#resolvedOptions, key)
          ? { configurable: true, enumerable: true, value: this.#resolvedOptions[key], writable: false }
          : undefined,
        set: () => false,
        deleteProperty: () => false,
        defineProperty: () => false,
      }),

      getRoot: () => this.#trackRenderer.getRoot(),
      getViewport: () => this.#trackRenderer.getViewport(),
      getTrack: () => this.#trackRenderer.getTrack(),
      getSlideElements: () => [...this.#trackRenderer.getSlideElements()],
      getVisualElements: () => [...this.#trackRenderer.getPositionElements()],
      getSlideElement: (i) => this.#trackRenderer.getSlideElement(i),
      renderSlide: (i) => {
        const slide = this.#slideManager.getSlide(i)
        if (!slide || this.#destroyed) return false
        if (this.#trackRenderer.getSlideElement(i)?.dataset.rendered === 'true') return true
        const epoch = this.#navigationEpoch
        let rendered = false
        this.#dispatchEvents(() => {
          this.#resetRender(i)
          if (this.#destroyed || this.#navigationEpoch !== epoch) return
          rendered = this.#trackRenderer.renderSlide(i, slide)
          if (!this.#destroyed && this.#navigationEpoch === epoch) this.#render()
        }, true)
        return rendered && !this.#destroyed && this.#navigationEpoch === epoch
      },
      refreshLayout: () => this.#trackRenderer.refreshLayout(),
    }, event => {
      if (event === 'motion:idle') return !this.#animating && this.#renderPhase === 'idle'
      return event !== 'render:reset' || this.#activeReset === null
        || this.#activeReset === this.#resetSerial
    })
    return { context: scope.context, cleanup: () => {
      closed = true
      scope.cleanup()
      scroll?.stop()
      scroll = null
    } }
  }

  /* ═══════════════ Navigation ═══════════════ */

  /** @param {1 | -1} direction */
  #navigateRelative(direction) {
    if (this.#destroyed) return
    if (this.#focusRequest) this.#focusRequest.cancelled = true
    // Insertion/removal can change the preserved slide's logical index before
    // render callbacks run. Resolve relative targets after that rebuild settles.
    if (this.#rebuilding) {
      this.#queuedNavigation = { relativeDirection: direction }
      return
    }
    this.#navigate(getNavigationTarget(this.#geometry, this.#resolvedOptions, this.getIndex(), direction), direction)
  }

  next() { this.#navigateRelative(1) }
  prev() { this.#navigateRelative(-1) }

  /** @param {number} index */
  goTo(index) { this.#navigate(index) }

  /**
   * Navigate from a logical index. Swipe callers provide the index captured
   * at pointerdown, never the index inferred from an in-progress drag.
   * @param {number} index
   * @param {1 | -1 | undefined} [direction]
   * @param {number | undefined} [fromIndex]
   * @param {number | undefined} [startPosition] raw position at gesture start
   * @param {number | undefined} [durationOverride] immediate focus navigation
   */
  #navigate(index, direction, fromIndex, startPosition, durationOverride) {
    if (this.#destroyed) return
    if (!Number.isInteger(index)) throw new TypeError('Carousel: index must be an integer')
    if (fromIndex !== undefined && !Number.isInteger(fromIndex)) {
      throw new TypeError('Carousel: gesture origin must be an integer')
    }
    if (startPosition !== undefined && !Number.isFinite(startPosition)) {
      throw new TypeError('Carousel: gesture startPosition must be finite')
    }
    if (this.#focusRequest) this.#focusRequest.cancelled = true
    if (this.#notifying) {
      this.#queuedNavigation = { index, direction, fromIndex, startPosition, durationOverride }
      return
    }
    // A newer direct request also supersedes queued work when it is a no-op.
    this.#queuedNavigation = null

    const count = this.#slideManager.getSlideCount()
    if (count === 0) return
    const loop = this.#loop !== null
    index = loop
      ? ((index % count) + count) % count
      : Math.max(0, Math.min(index, this.#maxIndex()))

    let previous = fromIndex ?? this.getIndex()
    if (this.#scrollMotion) {
      const stoppedEpoch = this.#stopAllAnimations()
      if (this.#destroyed || this.#navigationEpoch !== stoppedEpoch) return
    }
    if (this.#animating) {
      if (loop || this.#perScroll() > 1) return
      // Repeating the in-flight destination must keep its completion events
      // and animation clock alive, even once getIndex() rounds to that slide.
      if (fromIndex === undefined && index === this.#selectedIndex) return
      previous = fromIndex ?? this.#prevIndex
      const stoppedEpoch = this.#stopAllAnimations()
      if (this.#destroyed || this.#navigationEpoch !== stoppedEpoch) return
      if (this.#pendingResize) {
        const epoch = this.#navigationEpoch
        this.#applyResize(this.#pendingResizeStep ?? this.#step())
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
      }
    }

    if (index === previous) {
      const targetPos = loop
        ? this.#position + this.#loop.shortestDelta(this.#position, index)
        : this.#geometry.indexToPosition(index)
      if (Math.abs(targetPos - this.#position) > 0.01) {
        this.#animateSnapBack(index, durationOverride ?? this.#duration())
      }
      return
    }

    // Establish the animation lock before notifying external listeners.
    this.#prevIndex = previous
    this.#animating = true
    const epoch = ++this.#navigationEpoch
    this.#dispatchEvents(() => {
      this.#events.emit('slide:beforeChange', { fromIndex: previous, toIndex: index })
      if (!this.#destroyed && this.#navigationEpoch === epoch) {
        this.#events.emit('transition:start', { fromIndex: previous, toIndex: index })
      }
    })
    if (this.#destroyed || this.#navigationEpoch !== epoch) return

    // Gesture navigation is anchored to pointerdown. Using the already
    // dragged position for a directed delta can add an entire revolution.
    const targetPos = loop
      ? direction && startPosition !== undefined
        ? startPosition + this.#loop.directedDelta(startPosition, index, direction)
        : this.#position + (direction
          ? this.#loop.directedDelta(this.#position, index, direction)
          : this.#loop.shortestDelta(this.#position, index))
      : this.#geometry.indexToPosition(index)

    const duration = durationOverride ?? this.#duration()
    this.#selectedIndex = index
    this.#transitionDirection = Math.sign(targetPos - this.#position)
    if (isViewportTransition(this.#resolvedOptions.transition) || isSurfaceTransition(this.#resolvedOptions.transition)) {
      this.#performViewportTransition(targetPos, duration)
    } else if (this.#resolvedOptions.transition === 'fade' && (this.#resolvedOptions.slidesPerView ?? 1) <= 1) {
      this.#position = targetPos
      this.#performFade(previous, index, targetPos, duration)
    } else {
      this.#animateToPosition(targetPos, duration)
    }
  }

  /** Cover the complete viewport, commit the destination, then reveal it. */
  #performViewportTransition(targetPos, duration) {
    const viewport = this.#trackRenderer.getViewport()
    if (duration <= 0 || !viewport) {
      this.#position = targetPos
      if (this.#render()) this.#onAnimationComplete()
      return
    }
    const definition = this.#resolvedOptions.transition
    const transition = isSurfaceTransition(definition)
      ? new SurfaceTransition(viewport, definition, {
        fromElement: this.getSlideElement(this.#prevIndex), toElement: this.getSlideElement(this.#selectedIndex),
        trackElement: this.#trackRenderer.getTrack(), fromIndex: this.#prevIndex, toIndex: this.#selectedIndex,
        direction: targetPos < this.#position ? -1 : 1, orientation: this.#resolvedOptions.orientation,
        viewportSize: this.#trackRenderer.viewportSize,
      })
      : new ViewportTransition(viewport, definition, targetPos < this.#position)
    const epoch = this.#navigationEpoch
    const current = () => !this.#destroyed && this.#navigationEpoch === epoch
    const active = () => current() && this.#viewportTransition === transition
    this.#viewportTransition = transition
    const fail = error => {
      // A stale callback must never stop a replacement transition or overwrite
      // layout installed by update/destroy inside the effect itself.
      if (!active()) {
        this.#reportTransitionError(transition.name, error)
        return
      }
      const stoppedEpoch = this.#stopAllAnimations()
      this.#reportTransitionError(transition.name, error)
      if (this.#destroyed || this.#navigationEpoch !== stoppedEpoch) return
      this.#position = targetPos
      if (this.#render()) this.#onAnimationComplete()
    }
    try {
      this.#dispatchEvents(() => transition.initialize())
    } catch (error) {
      fail(error)
      return
    }
    if (!active()) return
    let committed = false
    const commitAt = transition.commitAt ?? 0.5
    if (commitAt === 0) {
      this.#position = targetPos
      if (!this.#render() || !active()) return
      committed = true
    }
    this.#runAnimation(duration, progress => {
      if (!active()) return
      try {
        if (!committed && progress >= commitAt) {
          this.#dispatchEvents(() => transition.render(commitAt))
          if (!active()) return
          this.#position = targetPos
          if (!this.#render() || !active()) return
          committed = true
          // Let position-sensitive plugins sample the committed destination
          // before revealing it, unless this is the final fallback frame.
          if (progress < 1 || progress === commitAt) return
        }
        this.#dispatchEvents(() => transition.render(progress))
      } catch (error) {
        fail(error)
      }
    }, () => {
      this.#destroyViewportTransition(transition)
      if (current()) this.#onAnimationComplete()
    })
  }

  /**
   * Fade transition: cross-fade between current and target slide.
   * @param {number} fromIdx
   * @param {number} toIdx
   * @param {number} targetPos
   * @param {number} duration
   */
  #performFade(fromIdx, toIdx, targetPos, duration) {
    if (duration <= 0) {
      if (this.#render()) this.#onAnimationComplete()
      return
    }
    const slides = this.#trackRenderer.getSlideElements()
    if (!slides[fromIdx] || !slides[toIdx]) { this.#animating = false; return }
    const transition = new FadeTransition(slides, this.#trackRenderer.getTrack(),
      this.#trackRenderer.slideSize, this.#trackRenderer.viewportSize,
      this.#resolvedOptions.orientation, fromIdx, toIdx, this.#transitionDirection, this.#geometry,
      this.#trackRenderer.getPositionElements().filter(element => element.dataset.carouselCopy !== undefined))
    this.#fadeTransition = transition
    this.#runAnimation(duration, progress => {
      transition.render(progress)
    }, () => {
      if (this.#fadeTransition !== transition) return
      this.#fadeTransition = null
      transition.destroy()
      this.#trackRenderer.refreshLayout()
      if (this.#render()) this.#onAnimationComplete()
    })
  }

  #cancelFade() {
    const transition = this.#fadeTransition
    if (!transition) return
    this.#fadeTransition = null
    transition.destroy()
    this.#trackRenderer.refreshLayout()
    this.#render()
  }

  /**
   * @param {number} targetPos
   * @param {number} duration
   */
  #animateToPosition(targetPos, duration) {
    this.#runPositionAnimation(targetPos, duration, () => this.#onAnimationComplete())
  }

  /**
   * Settle an aborted drag without emitting slide:change.
   * @param {number} index
   * @param {number} duration
   */
  #animateSnapBack(index, duration) {
    if (this.#destroyed) return
    if (!Number.isInteger(index)) throw new TypeError('Carousel: snap-back index must be an integer')
    if (this.#notifying) {
      this.#queuedNavigation = { snapBack: true, index, durationOverride: duration }
      return
    }
    this.#queuedNavigation = null
    // Gesture commands can supersede another snap-back or a decorative
    // transition. Retire its clock and resources before taking ownership.
    const epoch = this.#stopAllAnimations()
    if (this.#destroyed || this.#navigationEpoch !== epoch) return
    if (this.#pendingResize) {
      this.#applyResize(this.#pendingResizeStep ?? this.#step())
      if (this.#destroyed || this.#navigationEpoch !== epoch) return
    }
    const count = this.#slideManager.getSlideCount()
    // Keep the logical destination even when a hidden viewport has zero step.
    const targetIndex = this.#loop
      ? ((index % count) + count) % count
      : Math.max(0, Math.min(index, this.#maxIndex()))
    const targetPos = this.#loop
      ? this.#position + this.#loop.shortestDelta(this.#position, targetIndex)
      : this.#geometry.indexToPosition(targetIndex)
    this.#selectedIndex = targetIndex
    this.#prevIndex = this.#selectedIndex
    this.#runPositionAnimation(targetPos, duration, () => {
      this.#animating = false
      if (this.#pendingResize) {
        const previousStep = this.#pendingResizeStep ?? this.#step()
        this.#applyResize(previousStep, this.#selectedIndex)
      }
    })
  }

  /**
   * One animation clock for both loop and finite navigation. The position
   * model always holds the actual rendered coordinate, even mid-transition.
   * @param {number} targetPos
   * @param {number} duration
   * @param {() => void} done
   */
  #runPositionAnimation(targetPos, duration, done) {
    const startPos = this.#position
    this.#transitionDirection = Math.sign(targetPos - startPos)
    const time = Math.abs(targetPos - startPos) < 0.001 ? 0 : duration
    this.#runAnimation(time, progress => {
      const eased = 1 - Math.pow(1 - progress, 3)
      this.#position = startPos + (targetPos - startPos) * eased
      this.#render()
    }, done)
  }

  /** One owned clock for positional and decorative transitions. */
  #runAnimation(duration, render, done) {
    this.#animating = true
    const epoch = this.#navigationEpoch
    const current = () => !this.#destroyed && this.#navigationEpoch === epoch
    this.#transitionProgress = 0
    const draw = progress => {
      this.#transitionProgress = progress
      const serial = this.#renderSerial
      render(progress)
      if (current() && this.#renderSerial === serial) this.#publishRenderState('animation')
    }
    const complete = () => {
      this.#transitionProgress = null
      done()
      if (current()) this.#publishRenderState('idle')
      if (current()) this.#notifyMotionIdle('complete')
    }
    if (duration <= 0) {
      draw(1)
      if (current()) complete()
      return
    }
    this.#publishRenderState('animation')
    if (!current()) return
    const startTime = performance.now()
    let settled = false
    const finish = () => {
      if (settled || !current()) return
      settled = true
      if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = 0 }
      if (this.#animationTimer) { clearTimeout(this.#animationTimer); this.#animationTimer = 0 }
      draw(1)
      if (current()) complete()
    }
    const frame = now => {
      if (settled || !current()) return
      this.#rafId = 0
      const progress = Math.max(0, Math.min((now - startTime) / duration, 1))
      if (progress >= 1) { finish(); return }
      draw(progress)
      if (current()) this.#rafId = requestAnimationFrame(frame)
    }
    this.#animationTimer = setTimeout(finish, duration + 60)
    this.#rafId = requestAnimationFrame(frame)
  }

  /* ═══════════════ Public API ═══════════════ */

  #maxIndex() {
    return this.#geometry?.lastIndex ?? 0
  }

  getIndex() {
    if (!this.#geometry || this.#geometry.loopLength === 0) return this.#selectedIndex
    return this.#geometry.positionToIndex(this.#position, !!this.#loop)
  }

  getNavigationGeometry() { return this.#destroyed ? null : this.#geometry }

  getRealIndex() { return this.getIndex() }
  getSlide(index) { return this.#slideManager.getSlide(index ?? this.getIndex()) }
  getSlides() { return this.#slideManager.getSlides() }
  getSlideCount() { return this.#slideManager.getSlideCount() }
  getSlideElement(index = this.getIndex()) { return this.#trackRenderer.getSlideElement(index) }
  getSlideElements() { return [...this.#trackRenderer.getSlideElements()] }

  // Logical data is published before its DOM/position during reconciliation.
  // Nested mutations preserve this owned selection until the new position is
  // committed; public getIndex() continues to describe the rendered position.
  #collectionIndex() {
    const pending = this.#pendingSelection
    if (!pending) return this.getIndex()
    const retained = this.#slideManager.indexOfKey(pending.key)
    return retained >= 0 ? retained
      : Math.max(0, Math.min(pending.index, this.getSlideCount() - 1))
  }

  #beginCollectionSelection(index) {
    const bounded = Math.max(0, Math.min(index, this.getSlideCount() - 1))
    const selection = { key: this.#slideManager.getKey(bounded), index: bounded }
    this.#pendingSelection = selection
    return selection
  }

  #endCollectionSelection(selection) {
    if (this.#pendingSelection === selection) this.#pendingSelection = null
  }

  /** Replace only the supplied fields; ids remain stable for the life of a slide. */
  updateSlide(index, patch) {
    if (this.#destroyed) return
    const selected = this.#collectionIndex()
    const mutation = this.#slideManager.updateSlide(index, patch)
    const fields = ['content', 'lazy', 'meta', 'thumb'].filter(field => Object.hasOwn(patch, field))
    const change = { type: 'update', previousCount: this.getSlideCount(), updated: [index], fields }
    // A nested collection rebuild may have published new data before its DOM
    // ordering. Reconcile keys there instead of addressing an obsolete wrapper.
    if (this.#rebuilding || this.#trackRenderer.isMeasuringGeometry
      || this.#resolvedOptions.geometry && mutation.metadataChanged) {
      this.#rebuildTrack(selected, mutation.contentChanged
        ? new Set([this.#slideManager.getKey(index)]) : false, change)
      return
    }
    if (!mutation.contentChanged && !mutation.lazyChanged) {
      if (!this.#trackRenderer.updateSlide(index, mutation.slide)) return
      this.#dispatchEvents(() => this.#events.emit('slides:change', {
        ...change, count: this.getSlideCount(), index: this.getIndex(),
      }))
      return
    }
    this.#updateRetainedSlide(index, mutation.slide, selected, mutation.contentChanged, change)
  }

  #updateRetainedSlide(index, slide, selected, refreshContent, change) {
    const selection = this.#beginCollectionSelection(selected)
    try {
      this.#dispatchEvents(() => {
        const epoch = this.#stopAllAnimations()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#pendingResize = false
        this.#pendingResizeStep = null
        this.#resetRender(index)
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        if (!this.#trackRenderer.updateSlide(index, slide, { refreshContent })) return
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#initLoop()
        this.#selectedIndex = selected
        this.#position = this.#geometry.indexToPosition(selected, !!this.#loop)
        this.#endCollectionSelection(selection)
        if (!this.#render()) return
        this.#selectedIndex = this.getIndex()
        this.#rebuilding = false
        // Existing plugins use this event to retire a gesture and discover newly
        // pending lazy content. Unchanged wrappers and content owners are retained.
        this.#events.emit('resize', { slidesPerView: this.#resolvedOptions.slidesPerView ?? 1 })
        if (!this.#destroyed && this.#navigationEpoch === epoch) {
          this.#events.emit('slides:change', { ...change, count: this.getSlideCount(), index: this.getIndex() })
        }
      }, true)
    } finally { this.#endCollectionSelection(selection) }
  }

  /** Move an existing slide to a final array index without recreating its content. */
  moveSlide(from, to) {
    if (this.#destroyed) return
    const selected = this.#slideManager.getKey(this.#collectionIndex())
    if (!this.#slideManager.moveSlide(from, to)) return
    this.#rebuildTrack(this.#slideManager.indexOfKey(selected), false, {
      type: 'move', previousCount: this.getSlideCount(),
    })
  }

  /** Reconcile by explicit id, or by object identity when no id was supplied. */
  setSlides(slides) {
    if (this.#destroyed) return
    const previousIndex = this.#collectionIndex()
    const selected = this.#slideManager.getKey(previousIndex)
    const previousCount = this.getSlideCount()
    this.#slideManager.setSlides(slides)
    const retained = this.#slideManager.indexOfKey(selected)
    this.#rebuildTrack(retained < 0 ? previousIndex : retained, false, { type: 'set', previousCount })
  }

  /** Explicitly re-run content renderers for one slide or the whole collection. */
  refresh(index) {
    if (this.#destroyed) return
    if (index !== undefined) this.#slideManager.assertIndex(index)
    const change = { type: 'refresh', previousCount: this.getSlideCount() }
    if (index !== undefined && !this.#rebuilding && !this.#trackRenderer.isMeasuringGeometry) {
      this.#updateRetainedSlide(index, this.#slideManager.getSlide(index), this.#collectionIndex(), true,
        { ...change, updated: [index], fields: ['content'] })
      return
    }
    this.#rebuildTrack(this.#collectionIndex(), index === undefined ? true
      : new Set([this.#slideManager.getKey(index)]), change)
  }

  addSlide(slide, index) {
    if (this.#destroyed) return
    validateSlide(slide)
    if (index !== undefined && !Number.isInteger(index)) {
      throw new TypeError('Carousel: slide index must be an integer')
    }
    const currentIndex = this.#collectionIndex()
    const insertionIndex = index === undefined
      ? this.#slideManager.getSlideCount()
      : Math.max(0, Math.min(index, this.#slideManager.getSlideCount()))
    this.#slideManager.addSlide(slide, insertionIndex)
    this.#rebuildTrack(insertionIndex <= currentIndex ? currentIndex + 1 : currentIndex, false, {
      type: 'add', previousCount: this.getSlideCount() - 1,
    })
  }

  removeSlide(index) {
    if (this.#destroyed) return
    const count = this.#slideManager.getSlideCount()
    if (!Number.isInteger(index) || index < 0 || index >= count) return
    const currentIndex = this.#collectionIndex()
    this.#slideManager.removeSlide(index)
    this.#rebuildTrack(index < currentIndex ? currentIndex - 1 : currentIndex, false, {
      type: 'remove', previousCount: count,
    })
  }

  #rebuildTrack(index = this.#collectionIndex(), refreshContent = false, change) {
    const selection = this.#beginCollectionSelection(index)
    try {
      // Teardown callbacks belong to this reconciliation too. They must not
      // address an old wrapper ordering after the collection has already changed.
      this.#dispatchEvents(() => {
        const epoch = this.#stopAllAnimations()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#pendingResize = false
        this.#pendingResizeStep = null
        const opts = this.#resolvedOptions
        this.#resetRender()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#trackRenderer.rebuild(this.#slideManager.getSlides(), this.#trackLayout(), refreshContent)
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#initLoop()
        const idx = Math.min(index, this.#slideManager.getSlideCount() - 1)
        this.#position = this.#geometry.indexToPosition(Math.max(0, idx), !!this.#loop)
        this.#selectedIndex = Math.max(0, idx)
        this.#endCollectionSelection(selection)
        if (!this.#render()) return
        this.#selectedIndex = this.getIndex()
        this.#rebuilding = false
        this.#events.emit('resize', { slidesPerView: opts.slidesPerView ?? 1 })
        if (change && !this.#destroyed && this.#navigationEpoch === epoch) {
          this.#events.emit('slides:change', { ...change, count: this.getSlideCount(), index: this.getIndex() })
        }
      }, true)
    } finally { this.#endCollectionSelection(selection) }
  }

  update(options) {
    if (this.#destroyed) return
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Carousel: options must be an object')
    }
    if (options.breakpoints !== undefined
      && (!options.breakpoints || typeof options.breakpoints !== 'object' || Array.isArray(options.breakpoints))) {
      throw new TypeError('Carousel: breakpoints must be an object')
    }
    if (Object.prototype.hasOwnProperty.call(options, 'plugins')) {
      throw new TypeError('Carousel: plugins cannot be changed through update(); use use()')
    }
    if (Object.prototype.hasOwnProperty.call(options, 'startIndex')) {
      throw new TypeError('Carousel: startIndex is constructor-only')
    }
    const currentIndex = this.#collectionIndex()
    const previousOptions = this.#options
    const nextOptions = { ...previousOptions, ...options }
    validateOptionsTree(nextOptions)
    if (nextOptions.breakpoints) {
      nextOptions.breakpoints = Object.fromEntries(
        Object.entries(nextOptions.breakpoints).map(([width, override]) => [width, { ...override }]),
      )
    }
    if (this.#focusRequest) this.#focusRequest.cancelled = true
    this.#breakpointManager.updateBase(nextOptions)
    try {
      this.#resolvedOptions = validateResolvedOptions(this.#breakpointManager.resolve())
      this.#options = nextOptions
    } catch (error) {
      this.#breakpointManager.updateBase(previousOptions)
      throw error
    }
    this.#rebuildTrack(currentIndex)
  }

  /* ═══════════════ Events ═══════════════ */

  on(ev, fn) {
    if (this.#destroyed) throw new Error('Carousel is destroyed')
    return this.#events.on(ev, fn)
  }
  off(ev, fn) { this.#events.off(ev, fn) }
  once(ev, fn) {
    if (this.#destroyed) throw new Error('Carousel is destroyed')
    if (typeof fn !== 'function') throw new TypeError('Carousel: event handler must be a function')
    let pending = true
    const unsubscribe = this.#events.once(ev, (...args) => {
      // An EventBus emission can already have snapshotted this wrapper when
      // a nested emission consumes it. Guard that stale snapshot explicitly.
      if (!pending) return
      pending = false
      return fn(...args)
    })
    return () => {
      pending = false
      unsubscribe()
    }
  }

  /* ═══════════════ Lifecycle ═══════════════ */

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#idleNotification = null
    this.#pendingSelection = null
    this.#focusRequest = null
    this.#trackRenderer.getViewport()?.removeEventListener('focusin', this.#focusHandler, true)
    this.#focusHandler = null
    this.#stopAllAnimations()

    this.#events.emit('destroy')
    for (const name of [...this.#plugins.keys()].reverse()) {
      try { this.unuse(name) }
      catch (error) { console.error(`Carousel: plugin "${name}" failed to destroy`, error) }
    }
    this.#installingPluginNames.clear()
    this.#queuedNavigation = null

    this.#breakpointManager.destroy()
    this.#trackRenderer.destroy()
    this.#slideManager.clear()
    this.#renderState = null
    this.#geometry = null
    this.#loop = null
    this.#container = null
    this.#options = {}
    this.#resolvedOptions = {}
    this.#events.clear()
  }
}

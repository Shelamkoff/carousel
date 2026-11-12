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
import { getLastSlideIndex } from './navigation.js'
import { ViewportTransition, isViewportTransition } from './transitions/ViewportTransition.js'

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
      slidesPerView: opts.layout === 'expand' ? opts.expandVisible : opts.slidesPerView ?? 1,
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
    this.#position = this.#selectedIndex * this.#step()
    this.#render()

    this.#trackRenderer.onResize((previousSlideSize) => {
      const previousStep = previousSlideSize + this.#trackRenderer.gap
      if (this.#viewportTransition) {
        // A responsive geometry change settles the pending destination and
        // retires the decorative panels before publishing the resized state.
        const targetIndex = this.#selectedIndex
        const epoch = this.#stopAllAnimations()
        if (this.#destroyed || this.#navigationEpoch !== epoch) return
        this.#pendingResize = true
        this.#pendingResizeStep = previousStep
        this.#position = targetIndex * previousStep
        this.#onAnimationComplete()
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
    const idx = targetIndex ?? (previousStep <= 0
      ? this.#selectedIndex
      : this.#loop
        ? this.#loop.toIndex(this.#position)
        : this.#finiteIndex(previousStep))
    this.#pendingResize = false
    this.#pendingResizeStep = null
    this.#initLoop()
    this.#position = idx * this.#step()
    if (!this.#render()) return
    this.#selectedIndex = this.getIndex()
    this.#events.emit('resize', { slidesPerView: this.#resolvedOptions.slidesPerView ?? 1 })
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
    const N = this.#slideManager.getSlideCount()
    if (this.#resolvedOptions.loop && N > 0) {
      this.#loop = new LoopEngine(N, this.#step())
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
  #render(clamp = true, phase = this.#animating ? 'animation' : 'idle') {
    if (this.#destroyed) return false
    if (!this.#loop && clamp) {
      const maxPos = Math.max(0, this.#slideManager.getSlideCount()
        - (this.#resolvedOptions.slidesPerView ?? 1)) * this.#step()
      this.#position = Math.max(0, Math.min(this.#position, maxPos))
    }
    const epoch = this.#navigationEpoch
    let rendered = false
    this.#dispatchEvents(() => { rendered = this.#trackRenderer.renderPosition(this.#position, this.#loop) })
    if (rendered && !this.#destroyed && this.#navigationEpoch === epoch) this.#publishRenderState(phase)
    return rendered && !this.#destroyed && this.#navigationEpoch === epoch
  }

  #publishRenderState(phase = this.#animating ? 'animation' : 'idle') {
    if (this.#destroyed) return
    // Reconfiguration can clamp the selected slide to a new finite edge.
    // Publish that settled identity before callbacks cache the frame.
    if (phase === 'idle') this.#selectedIndex = this.getIndex()
    const delta = this.#position - this.#lastRenderPosition
    this.#renderDirection = Math.abs(delta) > 1e-9 ? Math.sign(delta)
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

  #resetRender() {
    const previous = this.#activeReset
    this.#activeReset = ++this.#resetSerial
    try { this.#events.emit('render:reset') }
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
    const oldIdx = this.getIndex()
    const epoch = this.#stopAllAnimations()
    if (this.#destroyed || this.#navigationEpoch !== epoch) return
    this.#pendingResize = false
    this.#pendingResizeStep = null
    this.#resolvedOptions = validateResolvedOptions(this.#breakpointManager.resolve())
    const opts = this.#resolvedOptions
    this.#dispatchEvents(() => {
      this.#resetRender()
      if (this.#destroyed || this.#navigationEpoch !== epoch) return
      this.#trackRenderer.rebuild(this.#slideManager.getSlides(), this.#trackLayout())
      if (this.#destroyed || this.#navigationEpoch !== epoch) return
      this.#initLoop()
      this.#position = oldIdx * this.#step()
      this.#selectedIndex = oldIdx
      if (!this.#render()) return
      this.#selectedIndex = this.getIndex()
      this.#rebuilding = false
      this.#events.emit('resize', { slidesPerView: opts.slidesPerView ?? 1 })
    }, true)
  }

  /* ═══════════════ Animation ═══════════════ */

  /** Stop all running animations (rAF, CSS transition, fade). */
  #stopAllAnimations() {
    const epoch = ++this.#navigationEpoch
    if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = 0 }
    if (this.#animationTimer) { clearTimeout(this.#animationTimer); this.#animationTimer = 0 }
    this.#animating = false
    this.#transitionProgress = null
    this.#transitionDirection = 0
    this.#renderState = null
    this.#renderPhase = 'idle'
    this.#renderDirection = 0
    this.#cancelFade()
    if (this.#navigationEpoch !== epoch) return epoch
    this.#trackRenderer.stopAnimation()
    if (this.#viewportTransition) this.#destroyViewportTransition(this.#viewportTransition)
    return epoch
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
    if (ownedPluginInstances.has(plugin)) throw new Error(`Plugin "${name}" is already owned by another Carousel`)
    const { context: ctx, cleanup } = this.#createPluginContext()
    ownedPluginInstances.add(plugin)
    this.#installingPluginNames.add(name)
    try {
      plugin.install(ctx)
      // install() may synchronously call carousel.destroy().
      if (this.#destroyed) throw new Error(`Carousel was destroyed while installing plugin "${name}"`)
      this.#plugins.set(name, { plugin, context: ctx, cleanupContext: cleanup })
    } catch (error) {
      try { plugin.destroy?.() } catch { /* preserve the installation error */ }
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
    try { entry.plugin.destroy?.() }
    finally {
      entry.cleanupContext()
      ownedPluginInstances.delete(entry.plugin)
    }
    return true
  }

  #createPluginContext() {
    return createPluginScope(this.#events, {
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
      snapBack: (index) => {
        const logical = index ?? this.getIndex()
        const targetPos = this.#loop
          ? this.#position + this.#loop.shortestDelta(this.#position, logical)
          : Math.max(0, Math.min(logical, this.#maxIndex(),
              this.#slideManager.getSlideCount() - (this.#resolvedOptions.slidesPerView ?? 1),
            )) * this.#step()
        this.#animateSnapBack(targetPos, this.#duration())
      },

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
        this.#position = pos
        this.#render(false, 'drag')
      },
      getStep: () => this.#step(),
      getLoopEngine: () => this.#loop,
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
          this.#resetRender()
          if (this.#destroyed || this.#navigationEpoch !== epoch) return
          rendered = this.#trackRenderer.renderSlide(i, slide)
          if (!this.#destroyed && this.#navigationEpoch === epoch) this.#render()
        }, true)
        return rendered && !this.#destroyed && this.#navigationEpoch === epoch
      },
      refreshLayout: () => this.#trackRenderer.refreshLayout(),
    }, event => event !== 'render:reset' || this.#activeReset === null
      || this.#activeReset === this.#resetSerial)
  }

  /* ═══════════════ Navigation ═══════════════ */

  #navigationStep() {
    const step = this.#perScroll()
    const count = this.#slideManager.getSlideCount()
    return this.#loop && count > 0 ? step % count : step
  }

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
    this.#navigate(this.getIndex() + direction * this.#navigationStep(), direction)
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
        : Math.min(index, Math.max(0, count - (this.#resolvedOptions.slidesPerView ?? 1))) * this.#step()
      if (Math.abs(targetPos - this.#position) > 0.01) {
        this.#animateSnapBack(targetPos, durationOverride ?? this.#duration())
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
      : Math.min(
          index * this.#step(),
          Math.max(0, count - (this.#resolvedOptions.slidesPerView ?? 1)) * this.#step(),
        )

    const duration = durationOverride ?? this.#duration()
    this.#selectedIndex = index
    this.#transitionDirection = Math.sign(targetPos - this.#position)
    if (isViewportTransition(this.#resolvedOptions.transition)) {
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
    const transition = new ViewportTransition(
      viewport, this.#resolvedOptions.transition, targetPos < this.#position,
    )
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
    this.#runAnimation(duration, progress => {
      if (!active()) return
      try {
        if (!committed && progress >= 0.5) {
          this.#dispatchEvents(() => transition.render(0.5))
          if (!active()) return
          this.#position = targetPos
          if (!this.#render() || !active()) return
          committed = true
          // Let position-sensitive plugins sample the committed destination
          // before revealing it, unless this is the final fallback frame.
          if (progress < 1) return
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
      this.#resolvedOptions.orientation, fromIdx, toIdx, this.#transitionDirection)
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
   * @param {number} targetPos
   * @param {number} duration
   */
  #animateSnapBack(targetPos, duration) {
    this.#selectedIndex = this.#loop
      ? this.#loop.toIndex(targetPos)
      : this.#finiteIndex(this.#step(), targetPos)
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
    return getLastSlideIndex(this.#slideManager.getSlideCount(), this.#resolvedOptions.slidesPerView ?? 1)
  }

  #finiteIndex(step, position = this.#position) {
    const maxIndex = this.#maxIndex()
    const lastPosition = Math.min(maxIndex, Math.max(0,
      this.#slideManager.getSlideCount() - (this.#resolvedOptions.slidesPerView ?? 1),
    )) * step
    // The last page can be a partial step. Rounding its coordinate alone
    // would report the preceding slide and keep next()/autoplay enabled.
    if (position >= lastPosition - Math.min(0.001, step * 1e-6)) return maxIndex
    return Math.max(0, Math.min(maxIndex, Math.round(position / step)))
  }

  getIndex() {
    const step = this.#pendingResizeStep ?? this.#step()
    if (step <= 0) return this.#selectedIndex
    if (this.#loop) return this.#loop.toIndex(this.#position)
    return this.#finiteIndex(step)
  }

  getRealIndex() { return this.getIndex() }
  getSlide(index) { return this.#slideManager.getSlide(index ?? this.getIndex()) }
  getSlides() { return this.#slideManager.getSlides() }
  getSlideCount() { return this.#slideManager.getSlideCount() }
  getSlideElement(index = this.getIndex()) { return this.#trackRenderer.getSlideElement(index) }
  getSlideElements() { return [...this.#trackRenderer.getSlideElements()] }

  /** Replace only the supplied fields; ids remain stable for the life of a slide. */
  updateSlide(index, patch) {
    if (this.#destroyed) return
    const selected = this.getIndex()
    this.#slideManager.updateSlide(index, patch)
    const refresh = Object.hasOwn(patch, 'content')
      ? new Set([this.#slideManager.getKey(index)]) : false
    this.#rebuildTrack(selected, refresh, { type: 'update', previousCount: this.getSlideCount() })
  }

  /** Move an existing slide to a final array index without recreating its content. */
  moveSlide(from, to) {
    if (this.#destroyed) return
    const selected = this.#slideManager.getKey(this.getIndex())
    if (!this.#slideManager.moveSlide(from, to)) return
    this.#rebuildTrack(this.#slideManager.indexOfKey(selected), false, {
      type: 'move', previousCount: this.getSlideCount(),
    })
  }

  /** Reconcile by explicit id, or by object identity when no id was supplied. */
  setSlides(slides) {
    if (this.#destroyed) return
    const previousIndex = this.getIndex()
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
    this.#rebuildTrack(this.getIndex(), index === undefined ? true
      : new Set([this.#slideManager.getKey(index)]), { type: 'refresh', previousCount: this.getSlideCount() })
  }

  addSlide(slide, index) {
    if (this.#destroyed) return
    validateSlide(slide)
    if (index !== undefined && !Number.isInteger(index)) {
      throw new TypeError('Carousel: slide index must be an integer')
    }
    const currentIndex = this.getIndex()
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
    const currentIndex = this.getIndex()
    this.#slideManager.removeSlide(index)
    this.#rebuildTrack(index < currentIndex ? currentIndex - 1 : currentIndex, false, {
      type: 'remove', previousCount: count,
    })
  }

  #rebuildTrack(index = this.getIndex(), refreshContent = false, change) {
    const epoch = this.#stopAllAnimations()
    if (this.#destroyed || this.#navigationEpoch !== epoch) return
    this.#pendingResize = false
    this.#pendingResizeStep = null
    const opts = this.#resolvedOptions
    this.#dispatchEvents(() => {
      this.#resetRender()
      if (this.#destroyed || this.#navigationEpoch !== epoch) return
      this.#trackRenderer.rebuild(this.#slideManager.getSlides(), this.#trackLayout(), refreshContent)
      if (this.#destroyed || this.#navigationEpoch !== epoch) return
      this.#initLoop()
      const idx = Math.min(index, this.#slideManager.getSlideCount() - 1)
      this.#position = Math.max(0, idx) * this.#step()
      this.#selectedIndex = Math.max(0, idx)
      if (!this.#render()) return
      this.#selectedIndex = this.getIndex()
      this.#rebuilding = false
      this.#events.emit('resize', { slidesPerView: opts.slidesPerView ?? 1 })
      if (change && !this.#destroyed && this.#navigationEpoch === epoch) {
        this.#events.emit('slides:change', { ...change, count: this.getSlideCount(), index: this.getIndex() })
      }
    }, true)
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
    const currentIndex = this.getIndex()
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
    this.#container = null
    this.#options = {}
    this.#resolvedOptions = {}
    this.#events.clear()
  }
}

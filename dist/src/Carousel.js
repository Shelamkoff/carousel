import { EventBus } from '@shelamkoff/event-bus'
import { SlideManager } from './SlideManager.js'
import { TrackRenderer } from './TrackRenderer.js'
import { LoopEngine } from './LoopEngine.js'
import { BreakpointManager } from './BreakpointManager.js'

const ownedPluginInstances = new WeakSet()

/** @type {import('./types').CarouselOptions} */
const DEFAULTS = {
  slidesPerView: 1,
  slidesPerScroll: 1,
  gap: 0,
  transition: 'slide',
  transitionDuration: 400,
  loop: false,
  startIndex: 0,
}

function validateResolvedOptions(options) {
  if (!Number.isFinite(options.slidesPerView) || options.slidesPerView <= 0) {
    throw new RangeError('Carousel: slidesPerView must be a positive number')
  }
  if (options.slidesPerScroll !== 'auto'
    && (!Number.isInteger(options.slidesPerScroll) || options.slidesPerScroll <= 0)) {
    throw new RangeError('Carousel: slidesPerScroll must be a positive integer or "auto"')
  }
  if (!Number.isFinite(options.gap) || options.gap < 0) {
    throw new RangeError('Carousel: gap must be a non-negative number')
  }
  if (!Number.isFinite(options.transitionDuration) || options.transitionDuration < 0) {
    throw new RangeError('Carousel: transitionDuration must be a non-negative number')
  }
  if (options.transition !== 'slide' && options.transition !== 'fade') {
    throw new TypeError('Carousel: transition must be "slide" or "fade"')
  }
  if (!Number.isInteger(options.startIndex) || options.startIndex < 0) {
    throw new RangeError('Carousel: startIndex must be a non-negative integer')
  }
  if (typeof options.loop !== 'boolean') {
    throw new TypeError('Carousel: loop must be a boolean')
  }
  return options
}

function validateOptionsTree(options) {
  const resolved = { ...options }
  const breakpoints = resolved.breakpoints
  delete resolved.breakpoints
  validateResolvedOptions(resolved)
  if (!breakpoints) return
  if (typeof breakpoints !== 'object' || Array.isArray(breakpoints)) {
    throw new TypeError('Carousel: breakpoints must be an object')
  }
  const entries = Object.entries(breakpoints)
    .map(([width, override]) => [Number(width), override])
    .sort((a, b) => a[0] - b[0])
  for (const [width, override] of entries) {
    if (!Number.isFinite(width) || width < 0) throw new RangeError('Carousel: breakpoint widths must be non-negative numbers')
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new TypeError('Carousel: breakpoint overrides must be objects')
    }
    if (Object.prototype.hasOwnProperty.call(override, 'plugins')
      || Object.prototype.hasOwnProperty.call(override, 'startIndex')) {
      throw new TypeError('Carousel: breakpoints cannot change plugins or startIndex')
    }
    Object.assign(resolved, override)
    delete resolved.breakpoints
    validateResolvedOptions(resolved)
  }
}

function validateSlide(slide) {
  if (!slide || typeof slide !== 'object') throw new TypeError('Carousel: each slide must be an object')
  const content = slide.content
  const isElement = typeof HTMLElement !== 'undefined' && content instanceof HTMLElement
  if (typeof content !== 'string' && typeof content !== 'function' && !isElement) {
    throw new TypeError('Carousel: slide content must be a string, HTMLElement, or render function')
  }
  if (slide.thumb !== undefined && typeof slide.thumb !== 'string') {
    throw new TypeError('Carousel: slide thumb must be a string')
  }
  if (slide.lazy !== undefined && typeof slide.lazy !== 'boolean') {
    throw new TypeError('Carousel: slide lazy must be a boolean')
  }
  if (slide.meta !== undefined
    && (!slide.meta || typeof slide.meta !== 'object' || Array.isArray(slide.meta))) {
    throw new TypeError('Carousel: slide meta must be an object')
  }
}

/**
 * Position-first carousel.
 *
 * position = raw px, single source of truth.
 * Animation via requestAnimationFrame (no CSS transitions, no transitionend).
 * Slides repositioned via individual transforms (loop, no clones).
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
  #loopTimer = 0
  /** @type {(() => void) | null} */
  #loopFinish = null
  /** @type {number} */
  #fadeTimer = 0
  /** @type {boolean} */
  #fadeCancelled = false
  #container = null
  #prevIndex = 0
  #pendingResize = false
  /** @type {number | null} */
  #pendingResizeStep = null
  #plugins = new Map()

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
    if (!(this.#container instanceof HTMLElement)) throw new TypeError('Carousel: container must be an HTMLElement')
    if (!Array.isArray(slides)) throw new TypeError('Carousel: slides must be an array')
    slides.forEach(validateSlide)
    if (options.plugins !== undefined && !Array.isArray(options.plugins)) {
      throw new TypeError('Carousel: plugins must be an array')
    }

    this.#options = {
      ...DEFAULTS,
      ...options,
      breakpoints: options.breakpoints
        ? Object.fromEntries(Object.entries(options.breakpoints).map(([width, override]) => [width, { ...override }]))
        : undefined,
      plugins: options.plugins ? [...options.plugins] : undefined,
    }
    validateOptionsTree(this.#options)
    this.#slideManager = new SlideManager(slides)
    this.#trackRenderer = new TrackRenderer()
    this.#breakpointManager = new BreakpointManager(this.#options, this.#options.breakpoints)

    try {
      this.#resolvedOptions = validateResolvedOptions(this.#breakpointManager.resolve())
      this.#breakpointManager.onChange(() => this.#handleBreakpointChange())
      this.#buildDOM()
      this.#trackRenderer.onRenderError((index, error) => {
        this.#events.emit('slide:error', { index, error })
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

  #buildDOM() {
    const opts = this.#resolvedOptions
    this.#trackRenderer.build(this.#container, this.#slideManager.getSlides(), {
      slidesPerView: opts.slidesPerView ?? 1,
      gap: opts.gap ?? 0,
      loop: opts.loop ?? false,
    })
    this.#initLoop()
    this.#position = (opts.startIndex ?? 0) * this.#step()
    this.#render()

    this.#trackRenderer.onResize((previousSlideWidth) => {
      const previousStep = previousSlideWidth + this.#trackRenderer.gap
      if (this.#animating) {
        this.#pendingResize = true
        this.#pendingResizeStep = previousStep
        return
      }
      this.#applyResize(previousStep)
    })
  }

  #applyResize(previousStep = this.#step()) {
    const idx = this.#loop
      ? this.#loop.toIndex(this.#position)
      : (previousStep > 0 ? Math.max(0, Math.round(this.#position / previousStep)) : 0)
    this.#initLoop()
    this.#position = idx * this.#step()
    this.#render()
    this.#pendingResize = false
    this.#pendingResizeStep = null
  }

  /** @returns {number} resolved slidesPerScroll */
  #perScroll() {
    const raw = this.#resolvedOptions.slidesPerScroll ?? 1
    return raw === 'auto' ? Math.max(1, Math.floor(this.#resolvedOptions.slidesPerView ?? 1)) : raw
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
  #step() { return this.#trackRenderer.slideWidth + this.#trackRenderer.gap }

  /**
   * Render position to DOM.
   * Loop: each slide positioned individually. Track stays at 0.
   * Non-loop: track moves, slides stay in flex flow.
   */
  #render() {
    if (this.#loop) {
      this.#loop.positionSlides(this.#trackRenderer.getSlideElements(), this.#position)
    } else {
      // Guard: clamp position to valid range for non-loop
      const step = this.#step()
      const count = this.#slideManager.getSlideCount()
      const perView = this.#resolvedOptions.slidesPerView ?? 1
      const maxPos = Math.max(0, count - perView) * step
      this.#position = Math.max(0, Math.min(this.#position, maxPos))
      this.#trackRenderer.setPosition(-this.#position)
    }
  }

  #handleBreakpointChange() {
    this.#stopAllAnimations()
    this.#pendingResize = false
    this.#pendingResizeStep = null
    const oldIdx = this.getIndex()
    this.#resolvedOptions = validateResolvedOptions(this.#breakpointManager.resolve())
    const opts = this.#resolvedOptions
    this.#trackRenderer.rebuild(this.#slideManager.getSlides(), {
      slidesPerView: opts.slidesPerView ?? 1,
      gap: opts.gap ?? 0,
      loop: opts.loop ?? false,
    })
    this.#initLoop()
    this.#position = oldIdx * this.#step()
    this.#render()
    this.#events.emit('resize', { slidesPerView: opts.slidesPerView ?? 1 })
  }

  /* ═══════════════ Animation ═══════════════ */

  /** Stop all running animations (rAF, CSS transition, fade). */
  #stopAllAnimations() {
    if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = 0 }
    if (this.#loopTimer) { clearTimeout(this.#loopTimer); this.#loopTimer = 0 }
    this.#loopFinish = null
    this.#cancelFade()
    this.#trackRenderer.stopAnimation()
    this.#animating = false
  }

  #onAnimationComplete() {
    this.#animating = false

    // Apply deferred resize before reporting final index
    if (this.#pendingResize) {
      this.#pendingResize = false
      const previousStep = this.#pendingResizeStep ?? this.#step()
      this.#pendingResizeStep = null
      this.#applyResize(previousStep)
    }

    const idx = this.getIndex()
    this.#events.emit('transition:end', { index: idx })
    this.#events.emit('slide:change', {
      index: idx,
      prevIndex: this.#prevIndex,
      slide: this.#slideManager.getSlide(idx),
    })
  }

  /* ═══════════════ Plugins ═══════════════ */

  use(plugin) {
    if (this.#destroyed) throw new Error('Cannot install a plugin on a destroyed Carousel')
    if (!plugin || typeof plugin.name !== 'string' || !plugin.name || typeof plugin.install !== 'function') {
      throw new TypeError('Plugin must define a non-empty name and an install(context) function')
    }
    if (this.#plugins.has(plugin.name)) throw new Error(`Plugin "${plugin.name}" already installed`)
    if (ownedPluginInstances.has(plugin)) throw new Error(`Plugin "${plugin.name}" is already owned by another Carousel`)
    const { context: ctx, cleanup } = this.#createPluginContext()
    ownedPluginInstances.add(plugin)
    try {
      plugin.install(ctx)
      this.#plugins.set(plugin.name, { plugin, context: ctx, cleanupContext: cleanup })
    } catch (error) {
      try { plugin.destroy?.() } catch { /* preserve the installation error */ }
      cleanup()
      ownedPluginInstances.delete(plugin)
      throw error
    }
    return this
  }

  getPlugin(name) { return this.#plugins.get(name)?.plugin }

  #createPluginContext() {
    const subscriptions = new Set()
    const trackSubscription = (unsubscribe) => {
      let active = true
      const tracked = () => {
        if (!active) return
        active = false
        subscriptions.delete(tracked)
        unsubscribe()
      }
      subscriptions.add(tracked)
      return tracked
    }
    const context = Object.freeze({
      on: (ev, fn) => trackSubscription(this.#events.on(ev, fn)),
      once: (ev, fn) => trackSubscription(this.#events.once(ev, fn)),
      emit: (ev, ...args) => this.#events.emit(ev, ...args),

      next: () => this.next(),
      prev: () => this.prev(),
      goTo: (i) => this.goTo(i),
      goToAfterDrag: (i) => {
        // Drag already stopped animation in onDown. Skip animation lock.
        this.#animating = false
        this.goTo(i)
      },
      snapBack: () => {
        const idx = this.getIndex()
        const targetPos = this.#loop
          ? this.#position + this.#loop.shortestDelta(this.#position, idx)
          : idx * this.#step()
        this.#animateSnapBack(targetPos, this.#resolvedOptions.transitionDuration ?? 400)
      },

      // Cancel animation without re-rendering (slides stay where rAF left them)
      stopAnimation: () => {
        this.#stopAllAnimations()
      },

      getPosition: () => this.#position,
      setPosition: (pos) => {
        if (!Number.isFinite(pos)) throw new TypeError('Carousel position must be finite')
        this.#stopAllAnimations()
        this.#position = pos
        this.#render()
      },
      // Lightweight: just update position + render. No timer/rAF cleanup.
      // Used during drag (60-120fps) where cleanup overhead matters.
      setPositionDrag: (pos) => {
        if (!Number.isFinite(pos)) throw new TypeError('Carousel drag position must be finite')
        this.#position = pos
        this.#render()
      },
      getStep: () => this.#step(),
      getLoopEngine: () => this.#loop,

      getIndex: () => this.getIndex(),
      getRealIndex: () => this.getRealIndex(),
      getSlide: (i) => this.#slideManager.getSlide(i ?? this.getIndex()),
      getSlides: () => this.#slideManager.getSlides(),
      getSlideCount: () => this.#slideManager.getSlideCount(),
      getSlidesPerView: () => this.#resolvedOptions.slidesPerView ?? 1,
      getSlidesPerScroll: () => this.#perScroll(),
      isLoop: () => this.#resolvedOptions.loop ?? false,

      options: new Proxy({}, { get: (_, p) => this.#resolvedOptions[p] }),

      getRoot: () => this.#trackRenderer.getRoot(),
      getViewport: () => this.#trackRenderer.getViewport(),
      getTrack: () => this.#trackRenderer.getTrack(),
      getSlideElements: () => [...this.#trackRenderer.getSlideElements()],
      getSlideElement: (i) => this.#trackRenderer.getSlideElement(i),
      refreshLayout: () => this.#trackRenderer.refreshLayout(),
    })
    return {
      context,
      cleanup: () => {
        for (const unsubscribe of [...subscriptions]) unsubscribe()
      },
    }
  }

  /* ═══════════════ Navigation ═══════════════ */

  next() { this.goTo(this.getIndex() + this.#perScroll()) }
  prev() { this.goTo(this.getIndex() - this.#perScroll()) }

  /** @param {number} index */
  goTo(index) {
    if (this.#destroyed) return
    if (!Number.isInteger(index)) throw new TypeError('Carousel: index must be an integer')

    // Animation lock:
    // - Loop: always lock (interrupting rAF causes derganie)
    // - Non-loop perScroll>1: lock (page navigation)
    // - Non-loop perScroll=1: interrupt and navigate immediately
    let wasAnimating = false
    if (this.#animating) {
      if (this.#loop || this.#perScroll() > 1) return
      this.#stopAllAnimations()
      wasAnimating = true
    }

    const count = this.#slideManager.getSlideCount()
    if (count === 0) return

    const loop = this.#loop !== null
    const prevIndex = this.getIndex()

    if (!loop) {
      const perView = this.#resolvedOptions.slidesPerView ?? 1
      const maxIdx = Math.max(0, Math.ceil(count - perView))
      index = Math.max(0, Math.min(index, maxIdx))
      if (index === prevIndex) {
        if (wasAnimating) {
          this.#position = index * this.#step()
          this.#render()
          this.#events.emit('transition:end', { index })
          this.#events.emit('slide:change', {
            index,
            prevIndex: this.#prevIndex,
            slide: this.#slideManager.getSlide(index),
          })
        }
        return
      }
    } else {
      index = ((index % count) + count) % count
      if (index === prevIndex) return
    }

    this.#prevIndex = prevIndex
    this.#events.emit('slide:beforeChange', { fromIndex: prevIndex, toIndex: index })
    this.#events.emit('transition:start', { fromIndex: prevIndex, toIndex: index })

    let targetPos
    if (loop) {
      const delta = this.#loop.shortestDelta(this.#position, index)
      targetPos = this.#position + delta
    } else {
      const perView = this.#resolvedOptions.slidesPerView ?? 1
      const maxPosition = Math.max(0, count - perView) * this.#step()
      targetPos = Math.min(index * this.#step(), maxPosition)
    }

    if (this.#resolvedOptions.transition === 'fade') {
      // Set position immediately so getIndex() returns target during animation
      this.#position = targetPos
      this.#performFade(prevIndex, index, targetPos, this.#resolvedOptions.transitionDuration ?? 400)
    } else {
      this.#animateToPosition(targetPos, this.#resolvedOptions.transitionDuration ?? 400)
    }
  }

  /**
   * Fade transition: cross-fade between current and target slide.
   * @param {number} fromIdx
   * @param {number} toIdx
   * @param {number} targetPos
   * @param {number} duration
   */
  #performFade(fromIdx, toIdx, targetPos, duration) {
    this.#animating = true

    // Fade is not compatible with multi-slide view
    if ((this.#resolvedOptions.slidesPerView ?? 1) > 1) {
      this.#animateToPosition(targetPos, duration)
      return
    }

    const slides = this.#trackRenderer.getSlideElements()
    const fromEl = slides[fromIdx]
    const toEl = slides[toIdx]
    if (!fromEl || !toEl) { this.#animating = false; return }

    const slideWidth = this.#trackRenderer.slideWidth
    const track = this.#trackRenderer.getTrack()

    // Lock track height before absolute positioning
    if (track) {
      track.style.height = track.offsetHeight + 'px'
      track.style.transform = 'none'
    }

    // Stack all slides, show only from and to
    for (const el of slides) {
      el.style.position = 'absolute'
      el.style.top = '0'
      el.style.left = '0'
      el.style.width = slideWidth + 'px'
      el.style.opacity = el === fromEl ? '1' : '0'
      el.style.visibility = el === fromEl || el === toEl ? 'visible' : 'hidden'
      el.style.transform = ''
    }

    void toEl.offsetWidth

    fromEl.style.transition = `opacity ${duration}ms ease`
    toEl.style.transition = `opacity ${duration}ms ease`
    fromEl.style.opacity = '0'
    toEl.style.opacity = '1'

    this.#fadeCancelled = false

    const finish = () => {
      if (this.#fadeCancelled) return
      this.#fadeTimer = 0
      this.#restoreSlidesAfterFade(slides, track)
      this.#render()
      this.#onAnimationComplete()
    }

    this.#fadeTimer = setTimeout(finish, duration + 20)
  }

  /** Cancel fade transition and restore slide styles immediately. */
  #cancelFade() {
    if (!this.#fadeTimer) return
    this.#fadeCancelled = true
    clearTimeout(this.#fadeTimer)
    this.#fadeTimer = 0
    const slides = this.#trackRenderer.getSlideElements()
    const track = this.#trackRenderer.getTrack()
    this.#restoreSlidesAfterFade(slides, track)
    this.#render()
  }

  /**
   * @param {HTMLElement[]} slides
   * @param {HTMLElement | null} track
   */
  #restoreSlidesAfterFade(slides, track) {
    const sw = this.#trackRenderer.slideWidth
    const loop = this.#loop !== null
    for (const el of slides) {
      el.style.position = loop ? 'absolute' : ''
      el.style.top = loop ? '0' : ''
      el.style.left = loop ? '0' : ''
      el.style.opacity = ''
      el.style.visibility = ''
      el.style.transition = ''
      el.style.width = sw + 'px'
      el.style.minWidth = sw + 'px'
      el.style.flexBasis = sw + 'px'
    }
    if (track) {
      track.style.height = ''
      track.style.transform = ''
    }
    this.#trackRenderer.refreshLayout()
  }

  /**
   * @param {number} targetPos
   * @param {number} duration
   */
  #animateToPosition(targetPos, duration) {
    this.#animating = true

    if (this.#loop) {
      // Loop: per-slide positioning via rAF + safety timeout fallback
      const startPos = this.#position
      const delta = targetPos - startPos
      const start = performance.now()
      let done = false

      const finish = () => {
        if (done) return
        done = true
        if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = 0 }
        if (this.#loopTimer) { clearTimeout(this.#loopTimer); this.#loopTimer = 0 }
        this.#loopFinish = null
        // Snap to exact slide position (avoid float drift from drag)
        const idx = this.#loop.toIndex(targetPos)
        this.#position = idx * this.#loop.step
        this.#loop.positionSlides(this.#trackRenderer.getSlideElements(), this.#position)
        this.#onAnimationComplete()
      }

      this.#loopFinish = finish
      this.#loopTimer = setTimeout(finish, duration + 50)

      const step = (now) => {
        if (done) return
        const t = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        this.#position = startPos + delta * eased
        this.#loop.positionSlides(this.#trackRenderer.getSlideElements(), this.#position)

        if (t < 1) {
          this.#rafId = requestAnimationFrame(step)
        } else {
          finish()
        }
      }
      this.#rafId = requestAnimationFrame(step)
    } else {
      // Non-loop: CSS transition on track
      this.#position = targetPos
      this.#trackRenderer.animateTo(-targetPos, duration, () => {
        this.#onAnimationComplete()
      })
    }
  }

  /**
   * Animate back to current slide without emitting slide:change.
   * @param {number} targetPos
   * @param {number} duration
   */
  #animateSnapBack(targetPos, duration) {
    this.#animating = true

    const onDone = () => {
      this.#animating = false
      if (this.#pendingResize) {
        this.#pendingResize = false
        const previousStep = this.#pendingResizeStep ?? this.#step()
        this.#pendingResizeStep = null
        this.#applyResize(previousStep)
      }
    }

    if (this.#loop) {
      const startPos = this.#position
      const delta = targetPos - startPos
      const start = performance.now()
      let done = false

      const finish = () => {
        if (done) return
        done = true
        if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = 0 }
        if (this.#loopTimer) { clearTimeout(this.#loopTimer); this.#loopTimer = 0 }
        this.#loopFinish = null
        const idx = this.#loop.toIndex(targetPos)
        this.#position = idx * this.#loop.step
        this.#loop.positionSlides(this.#trackRenderer.getSlideElements(), this.#position)
        onDone()
      }

      this.#loopFinish = finish
      this.#loopTimer = setTimeout(finish, duration + 50)

      const step = (now) => {
        if (done) return
        const t = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        this.#position = startPos + delta * eased
        this.#loop.positionSlides(this.#trackRenderer.getSlideElements(), this.#position)
        if (t < 1) this.#rafId = requestAnimationFrame(step)
        else finish()
      }
      this.#rafId = requestAnimationFrame(step)
    } else {
      this.#position = targetPos
      this.#trackRenderer.animateTo(-targetPos, duration, onDone)
    }
  }

  /* ═══════════════ Public API ═══════════════ */

  getIndex() {
    if (this.#loop) return this.#loop.toIndex(this.#position)
    const step = this.#step()
    return step > 0 ? Math.max(0, Math.round(this.#position / step)) : 0
  }

  getRealIndex() { return this.getIndex() }
  getSlide(index) { return this.#slideManager.getSlide(index ?? this.getIndex()) }
  getSlides() { return this.#slideManager.getSlides() }

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
    this.#rebuildTrack(insertionIndex <= currentIndex ? currentIndex + 1 : currentIndex)
  }

  removeSlide(index) {
    if (this.#destroyed) return
    const count = this.#slideManager.getSlideCount()
    if (!Number.isInteger(index) || index < 0 || index >= count) return
    const currentIndex = this.getIndex()
    this.#slideManager.removeSlide(index)
    this.#rebuildTrack(index < currentIndex ? currentIndex - 1 : currentIndex)
  }

  #rebuildTrack(index = this.getIndex()) {
    this.#stopAllAnimations()
    this.#pendingResize = false
    this.#pendingResizeStep = null
    const opts = this.#resolvedOptions
    this.#trackRenderer.rebuild(this.#slideManager.getSlides(), {
      slidesPerView: opts.slidesPerView ?? 1,
      gap: opts.gap ?? 0,
      loop: opts.loop ?? false,
    })
    this.#initLoop()
    const idx = Math.min(index, this.#slideManager.getSlideCount() - 1)
    this.#position = Math.max(0, idx) * this.#step()
    this.#render()
    this.#events.emit('resize', { slidesPerView: opts.slidesPerView ?? 1 })
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
    const nextOptions = {
      ...previousOptions,
      ...options,
      breakpoints: Object.prototype.hasOwnProperty.call(options, 'breakpoints')
        ? options.breakpoints
          ? Object.fromEntries(Object.entries(options.breakpoints).map(([width, override]) => [width, { ...override }]))
          : undefined
        : previousOptions.breakpoints,
    }
    validateOptionsTree(nextOptions)
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
    return this.#events.once(ev, fn)
  }

  /* ═══════════════ Lifecycle ═══════════════ */

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#stopAllAnimations()

    this.#events.emit('destroy')
    const entries = [...this.#plugins.values()]
    for (let i = entries.length - 1; i >= 0; i--) {
      try {
        entries[i].plugin.destroy?.()
      } catch (error) {
        console.error(`Carousel: plugin "${entries[i].plugin.name}" failed to destroy`, error)
      } finally {
        entries[i].cleanupContext()
        ownedPluginInstances.delete(entries[i].plugin)
      }
    }
    this.#plugins.clear()

    this.#breakpointManager.destroy()
    this.#trackRenderer.destroy()
    this.#slideManager.clear()
    this.#container = null
    this.#options = {}
    this.#resolvedOptions = {}
    this.#events.clear()
  }
}

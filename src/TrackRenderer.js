import { moveElement } from './dom.js'
import { SlideContent } from './SlideContent.js'
import { resolveLayoutSlots } from './layouts.js'
import { writeSlideProgress } from './renderState.js'
import { createNavigationGeometry } from './NavigationGeometry.js'

/**
 * DOM construction and positioning.
 * In loop mode: slides are absolutely positioned along the selected axis.
 * Track does not use flex — slides controlled entirely by JS.
 */
export class TrackRenderer {
  /** @type {HTMLElement | null} */
  #viewport = null
  /** @type {HTMLElement | null} */
  #track = null
  /** @type {HTMLElement[]} */
  #slideElements = []
  /** @type {HTMLElement[]} */
  #copies = []
  /** @type {import('./types').SlideData[]} */
  #sourceSlides = []
  /** @type {Array<import('./types').SlideData['content']>} */
  #sourceContent = []
  #sourceKeys = []
  /** @type {HTMLElement | null} */
  #root = null
  /** @type {ResizeObserver | null} */
  #resizeObserver = null
  /** @type {ResizeObserver | null} */
  #slideResizeObserver = null
  /** @type {number} */
  #observedLayoutFrame = 0
  /** @type {number} */
  #slidesPerView = 1
  /** @type {number} */
  #gap = 0
  /** @type {number} */
  #slideSize = 0
  /** @type {((previousSlideSize: number) => void) | null} */
  #onResize = null
  /** @type {boolean} */
  #isLoop = false
  #vertical = false
  #expanding = false
  #layoutOptions = { layout: 'standard' }
  #lastSlots = null
  #failedLayout = false
  #onLayoutError = null
  #onGeometryError = null
  #geometry = null
  #failedGeometry = false
  #measurementDepth = 0
  /** @type {((index: number, error: Error) => void) | null} */
  #onRenderError = null
  #document = null
  #view = null
  #revision = 0
  #content = new SlideContent((index, error) => this.#reportRenderError(index, error))

  /**
   * @param {HTMLElement} container
   * @param {import('./types').SlideData[]} slides
   * @param {{ slidesPerView: number, gap: number, loop?: boolean, ariaLabel?: string, orientation?: 'horizontal' | 'vertical', viewportHeight?: number }} layout
   */
  build(container, slides, layout) {
    this.destroy()
    this.#document = container.ownerDocument ?? document
    this.#view = this.#document.defaultView
    this.#isLoop = layout.loop ?? false

    const root = this.#document.createElement('div')
    root.className = 'carousel' + (this.#isLoop ? ' carousel--loop' : '')
    root.setAttribute('role', 'region')
    root.setAttribute('aria-roledescription', 'carousel')
    root.setAttribute('aria-label', layout.ariaLabel ?? 'Carousel')

    const viewport = this.#document.createElement('div')
    viewport.className = 'carousel__viewport'

    const track = this.#document.createElement('div')
    track.className = 'carousel__track'

    this.#slideElements = slides.map((slide, i) => this.#createSlide(slide, i, slides.length))
    this.#sourceKeys = layout.keys ?? [...slides]
    this.#sourceSlides = [...slides]
    this.#sourceContent = slides.map(slide => slide.content)
    for (const el of this.#slideElements) track.appendChild(el)

    viewport.appendChild(track)
    root.appendChild(viewport)
    container.appendChild(root)

    this.#root = root
    this.#viewport = viewport
    this.#track = track

    this.#configureOrientation(layout)
    this.updateLayout(layout.slidesPerView, layout.gap)
    this.#configureCopies(layout.visibleSlides ?? layout.slidesPerView)
    this.#setupResizeObserver()
    this.#setupSlideResizeObserver()

    return { root, viewport, track }
  }

  /**
   * @param {import('./types').SlideData} slide
   * @param {number} index
   * @param {number} count
   */
  #createSlide(slide, index, count) {
    const el = this.#document.createElement('div')
    el.className = 'carousel__slide'
    el.setAttribute('role', 'group')
    el.setAttribute('aria-roledescription', 'slide')
    el.setAttribute('aria-label', String(index + 1) + ' of ' + count)
    el.dataset.index = String(index)
    if (!slide.lazy) this.#renderContent(el, slide, index)
    return el
  }

  /**
   * Partial swipes need more visual slots than source slides in short loops.
   * Copies are inert and do not participate in logical indexes or events.
   * @param {number} perView
   */
  #configureCopies(perView) {
    const revision = this.#revision
    const retired = this.#copies
    this.#copies = []
    // Custom element callbacks may rebuild or destroy while copies detach.
    // Retire the complete old set without touching a nested rebuild's copies.
    for (const node of retired) node.remove()
    if (this.#revision !== revision) return
    if (!this.#isLoop || !this.#track || perView <= 0) return
    const count = this.#slideElements.length
    // Fractional views still need one extra wrap slot while dragging.
    if (count === 0) return
    let cycles = count <= Math.ceil(perView) ? Math.ceil(perView / count) : 0
    if (this.#geometry && !this.#geometry.uniform && this.#geometry.loopLength > 0) {
      const largest = this.#geometry.slides.reduce((size, slide) => Math.max(size, slide.size), 0)
      if (this.#geometry.loopLength <= this.viewportSize + largest) {
        cycles = Math.max(cycles, Math.ceil(this.viewportSize / this.#geometry.loopLength))
      }
    }
    for (let cycle = 1; cycle <= cycles; cycle++) {
      for (let i = 0; i < count; i++) {
        const copy = /** @type {HTMLElement} */ (this.#slideElements[i].cloneNode(true))
        if (this.#revision !== revision) return
        copy.dataset.carouselCopy = String(cycle)
        copy.setAttribute('aria-hidden', 'true')
        copy.inert = true
        this.#prepareCopy(copy)
        if (this.#revision !== revision) return
        this.#copies.push(copy)
        this.#track.appendChild(copy)
        if (this.#revision !== revision) return
      }
    }
  }

  /**
   * Visual replicas must not own IDs, radio groups, submitted form values or
   * constraints. Inert only suppresses interaction, not form participation.
   * Prepare the subtree before attachment so checked radios cannot uncheck
   * the application-owned original while joining its form.
   * @param {HTMLElement} copy
   */
  #prepareCopy(copy) {
    const elements = [copy]
    for (const element of elements) {
      element.removeAttribute('id')
      element.removeAttribute('name')
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FIELDSET', 'OPTION', 'OPTGROUP'].includes(element.tagName)) {
        element.disabled = true
      } else if (element.constructor?.formAssociated === true) {
        // Inert custom controls still participate in native form validation.
        // Disable already-upgraded form-associated replicas before attachment.
        element.setAttribute('disabled', '')
      }
      elements.push(...element.children)
    }
  }

  /** @param {number} index */
  #syncCopies(index) {
    const revision = this.#revision
    const original = this.#slideElements[index]
    for (const copy of this.#copies) {
      if (Number(copy.dataset.index) !== index) continue
      const content = original.cloneNode(true)
      if (this.#revision !== revision) return
      this.#prepareCopy(content)
      if (this.#revision !== revision) return
      copy.replaceChildren(...content.childNodes)
      if (this.#revision !== revision) return
      for (const name of ['rendered', 'loaded']) {
        if (original.dataset[name] === undefined) delete copy.dataset[name]
        else copy.dataset[name] = original.dataset[name]
      }
      for (const name of ['carousel__slide--error', 'carousel__slide--loaded']) {
        copy.classList.toggle(name, original.classList.contains(name))
      }
    }
  }

  /** @type {number} */
  #lastViewportSize = 0
  #lastViewportCrossSize = 0

  #setupResizeObserver() {
    if (!this.#viewport) return
    this.#lastViewportSize = this.#measureViewportSize()
    this.#lastViewportCrossSize = this.#vertical ? this.#viewport.offsetWidth : 0
    const Observer = this.#view?.ResizeObserver ?? ResizeObserver
    this.#resizeObserver = new Observer(() => {
      if (this.#viewport && (this.#measureViewportSize() !== this.#lastViewportSize
        || (this.#vertical && this.#viewport.offsetWidth !== this.#lastViewportCrossSize))) {
        this.#scheduleObservedLayout()
      }
    })
    this.#resizeObserver.observe(this.#viewport)
  }

  #setupSlideResizeObserver() {
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    if (!this.#isLoop && !this.#expanding) return
    const Observer = this.#view?.ResizeObserver ?? ResizeObserver
    this.#slideResizeObserver = new Observer(() => this.#scheduleObservedLayout())
    for (const slide of this.#slideElements) this.#slideResizeObserver.observe(slide)
  }

  #scheduleObservedLayout() {
    if (this.#observedLayoutFrame) return
    // Slide widths can change intrinsic media height and hence the observed
    // viewport. Apply layout outside ResizeObserver delivery to avoid a loop.
    const requestFrame = this.#view?.requestAnimationFrame?.bind(this.#view) ?? requestAnimationFrame
    this.#observedLayoutFrame = requestFrame(() => {
      this.#observedLayoutFrame = 0
      if (!this.#viewport) return
      const size = this.#measureViewportSize()
      const crossSize = this.#vertical ? this.#viewport.offsetWidth : 0
      if (size !== this.#lastViewportSize || crossSize !== this.#lastViewportCrossSize) {
        this.#lastViewportSize = size
        this.#lastViewportCrossSize = crossSize
        const previousSlideSize = this.#slideSize
        if (!this.#recalcSlideSize()) return
        this.#onResize?.(previousSlideSize)
      } else {
        this.#updateTrackHeight()
      }
    })
  }

  #cancelObservedLayout() {
    if (this.#observedLayoutFrame) {
      const cancelFrame = this.#view?.cancelAnimationFrame?.bind(this.#view) ?? cancelAnimationFrame
      cancelFrame(this.#observedLayoutFrame)
    }
    this.#observedLayoutFrame = 0
  }

  /** @param {(previousSlideSize: number) => void} cb */
  onResize(cb) { this.#onResize = cb }

  /** @param {(index: number, error: Error) => void} cb */
  onRenderError(cb) { this.#onRenderError = cb }
  onLayoutError(cb) { this.#onLayoutError = cb }
  onGeometryError(cb) { this.#onGeometryError = cb }
  getNavigationGeometry() { return this.#geometry }
  get isMeasuringGeometry() { return this.#measurementDepth > 0 }
  get revision() { return this.#revision }

  #reportRenderError(index, error, handler = this.#onRenderError) {
    if (handler) handler(index, error)
    else console.error(`Carousel: failed to render slide ${index}`, error)
  }

  /** @param {HTMLElement} el @param {import('./types').SlideData} slide @param {number} index */
  #renderContent(el, slide, index) {
    const revision = this.#revision
    return this.#content.render(el, slide.content, index, () => this.#revision === revision)
  }

  /** @param {number} trackIndex @param {import('./types').SlideData} slide */
  renderSlide(trackIndex, slide) {
    const revision = this.#revision
    const el = this.#slideElements[trackIndex]
    if (!el) return false
    if (el.dataset.rendered === 'true') return true
    this.#renderContent(el, slide, trackIndex)
    if (this.#revision !== revision || el.dataset.rendered !== 'true') return false
    this.#syncCopies(trackIndex)
    if (this.#revision !== revision) return false
    this.refreshLayout()
    return true
  }

  /** Update one retained identity; metadata changes never touch its DOM or layout. */
  updateSlide(index, slide, { refreshContent = false } = {}) {
    const element = this.#slideElements[index]
    if (!element || !this.#track) return false
    const previous = this.#sourceSlides[index]
    const contentChanged = refreshContent || this.#sourceContent[index] !== slide.content
    const materialize = !!previous.lazy !== !!slide.lazy && !slide.lazy && element.dataset.rendered !== 'true'
    // Publish bookkeeping before entering cleanup/factories, so a nested update
    // can replace it without an obsolete assignment after the callback returns.
    this.#sourceSlides[index] = slide
    this.#sourceContent[index] = slide.content
    if (!contentChanged && !materialize) return true

    const revision = ++this.#revision
    const current = () => this.#revision === revision
    this.#lastSlots = null
    if (slide.lazy) this.#content.clear(element, index, current)
    else this.#renderContent(element, slide, index)
    if (!current()) return false
    this.#syncCopies(index)
    if (!current()) return false
    this.refreshLayout()
    return current()
  }

  /** Keep orientation and viewport sizing together during atomic rebuilds. */
  #configureOrientation(layout) {
    // An error listener may replace content during measurement. Its nested
    // reconciliation inherits this failure instead of recursively retrying it.
    const retainGeometryFailure = this.#measurementDepth > 0
      && this.#layoutOptions.geometry === layout.geometry && this.#failedGeometry
    this.#vertical = layout.orientation === 'vertical'
    this.#expanding = (layout.layout ?? 'standard') !== 'standard' || layout.geometry !== undefined
    this.#layoutOptions = { ...layout, layout: layout.layout ?? 'standard' }
    this.#failedLayout = false
    this.#failedGeometry = retainGeometryFailure
    this.#lastSlots = null
    this.#root?.classList.toggle('carousel--vertical', this.#vertical)
    this.#root?.classList.toggle('carousel--expand', layout.layout === 'expand')
    this.#root?.classList.toggle('carousel--custom-layout', typeof layout.layout === 'object')
    this.#root?.classList.toggle('carousel--geometry', layout.geometry !== undefined)
    if (this.#viewport) {
      this.#viewport.style.height = this.#vertical && layout.viewportHeight !== undefined
        ? layout.viewportHeight + 'px' : ''
      this.#viewport.scrollLeft = 0
      this.#viewport.scrollTop = 0
    }
  }

  #measureViewportSize() {
    return this.#vertical ? this.#viewport.offsetHeight : this.#viewport.offsetWidth
  }

  /** @param {number} slidesPerView @param {number} gap */
  updateLayout(slidesPerView, gap) {
    if (!this.#viewport || !this.#track) return
    this.#slidesPerView = slidesPerView
    this.#gap = gap
    this.#root?.style.setProperty('--carousel-gap', gap + 'px')
    // Non-loop: flex gap for spacing. Loop: gap handled by LoopEngine step.
    this.#track.style.gap = this.#isLoop || this.#expanding ? '' : gap + 'px'
    this.#recalcSlideSize()
  }

  #recalcSlideSize() {
    if (!this.#viewport) return false
    const revision = this.#revision
    const size = this.#measureViewportSize()
    this.#lastViewportSize = size
    this.#lastViewportCrossSize = this.#vertical ? this.#viewport.offsetWidth : 0
    const totalGap = this.#gap * (this.#slidesPerView - 1)
    this.#slideSize = Math.max(0, (size - totalGap) / this.#slidesPerView)

    const context = {
      viewportSize: size, count: this.#sourceSlides.length,
      slidesPerView: this.#layoutOptions.logicalSlidesPerView ?? this.#slidesPerView,
      gap: this.#gap, orientation: this.#vertical ? 'vertical' : 'horizontal',
      slides: this.#sourceSlides.map((_, index) => ({ index })),
    }
    const uniform = { slideSize: this.#slideSize, step: this.#slideSize + this.#gap }
    let measured
    this.#measurementDepth++
    try {
      const definition = this.#failedGeometry ? undefined : this.#layoutOptions.geometry
      const input = definition ? { ...context,
        slides: this.#sourceSlides.map((slide, index) => ({ index, id: slide.id, meta: slide.meta })),
      } : context
      measured = createNavigationGeometry(input, definition, uniform)
    } catch (error) {
      if (this.#revision !== revision) return false
      this.#failedGeometry = true
      measured = createNavigationGeometry(context, undefined, uniform)
      const normalized = error instanceof Error ? error : new Error(String(error))
      const name = this.#layoutOptions.geometry?.name ?? 'geometry'
      if (this.#onGeometryError) this.#onGeometryError(name, normalized)
      else console.error(`Carousel: geometry "${name}" failed`, normalized)
    } finally {
      this.#measurementDepth--
    }
    if (this.#revision !== revision) return false
    this.#geometry = measured
    this.#lastSlots = null

    for (const el of this.getPositionElements()) {
      const slideSize = measured.slides[Number(el.dataset.index)]?.size ?? this.#slideSize
      el.style.width = this.#vertical ? '100%' : slideSize + 'px'
      el.style.minWidth = this.#vertical ? '0' : slideSize + 'px'
      el.style.height = this.#vertical ? slideSize + 'px' : ''
      el.style.minHeight = this.#vertical ? slideSize + 'px' : ''
      el.style.flexBasis = slideSize + 'px'
      el.style.flexShrink = '0'
      el.style.flexGrow = '0'

      if (this.#isLoop || this.#expanding) {
        // Loop/expanding layouts position cards individually
        el.style.position = 'absolute'
        el.style.top = '0'
        el.style.left = '0'
      } else {
        // Non-loop: ensure flex flow (clear any leftover absolute from rebuild)
        el.style.position = ''
        el.style.top = ''
        el.style.left = ''
        el.style.transform = ''
        for (const name of ['--carousel-expand-focus', '--carousel-slide-focus', '--carousel-slide-progress']) {
          el.style.removeProperty?.(name)
        }
      }
    }

    this.#updateTrackHeight()
    return this.#revision === revision
  }

  #updateTrackHeight() {
    if (!this.#track) return
    if (this.#vertical) {
      this.#track.style.height = this.#lastViewportSize + 'px'
      return
    }
    if (!this.#isLoop && !this.#expanding) return
    // Set track height from tallest slide (absolute positioning removes from flow)
    // Use scrollHeight as fallback since offsetHeight may be 0 before content renders
    let maxH = 0
    for (const el of this.#slideElements) {
      maxH = Math.max(maxH, el.offsetHeight || el.scrollHeight)
    }
    const height = maxH + 'px'
    if (this.#track.style.height !== height) this.#track.style.height = height
  }

  /** Recalculate dimensions after a plugin renders or changes slide content. */
  refreshLayout() {
    if (this.#isLoop || this.#vertical || this.#expanding) this.#updateTrackHeight()
  }

  /** Rebuild visual coverage after a measured resize, retaining live content. */
  refreshCopies() {
    if (!this.#track) return false
    const revision = ++this.#revision
    this.#lastSlots = null
    this.#configureCopies(this.#layoutOptions.visibleSlides ?? this.#slidesPerView)
    return this.#revision === revision
  }

  /** @returns {number} */
  get viewportSize() { return this.#lastViewportSize }
  /** Legacy main-axis alias; horizontal behavior is unchanged. */
  get viewportWidth() { return this.#lastViewportSize }
  /** @returns {number} */
  get slideSize() { return this.#slideSize }
  /** Legacy main-axis alias; horizontal behavior is unchanged. */
  get slideWidth() { return this.#slideSize }
  /** @returns {number} */
  get gap() { return this.#gap }
  /** @returns {number} */
  get slidesPerView() { return this.#slidesPerView }

  /** @param {number} offset */
  setPosition(offset) {
    if (!this.#track) return
    this.#track.style.transition = 'none'
    this.#track.style.transform = this.#vertical
      ? `translate3d(0, ${offset}px, 0)` : `translate3d(${offset}px, 0, 0)`
  }

  /** Numeric geometry is calculated once and shared with effects, never read back from CSS. */
  #baseSlots(position, engine) {
    const elements = this.getPositionElements()
    const geometry = this.#geometry
    if (!geometry) return []
    return geometry.getSlots(elements.map(element => ({
      index: Number(element.dataset.index), copy: Number(element.dataset.carouselCopy ?? 0),
    })), position, !!engine, this.#lastViewportSize)
      .map((slot, index) => ({ ...slot, element: elements[index] }))
  }

  getRenderSlots(position, engine) { return this.#lastSlots ?? this.#baseSlots(position, engine) }

  renderPosition(position, engine) {
    if (!this.#viewport || !this.#track) return false
    const revision = this.#revision
    const options = this.#layoutOptions
    const layout = options.layout
    // Preserve the O(1) track-transform path for an ordinary finite carousel.
    // Its per-slide snapshot is allocated only when a render consumer asks for it.
    if (!engine && layout === 'standard' && !options.geometry) {
      this.#lastSlots = null
      this.setPosition(-position)
      return true
    }
    const base = this.#baseSlots(position, engine)
    let slots = base
    if (layout !== 'standard' && !this.#failedLayout) {
      try {
        const geometry = resolveLayoutSlots(layout, {
          position, step: this.#slideSize + this.#gap, viewportSize: this.#lastViewportSize,
          logicalPosition: this.#geometry?.logicalPosition(position, !!engine) ?? 0,
          gap: this.#gap, count: this.#slideElements.length, loop: !!engine,
          orientation: this.#vertical ? 'vertical' : 'horizontal',
          slides: base.map(({ element, ...slot }) => slot),
        }, options)
        slots = base.map((slot, index) => ({ ...slot, ...geometry[index] }))
      } catch (error) {
        if (this.#revision !== revision) return false
        this.#failedLayout = true
        const name = typeof layout === 'string' ? layout : layout.name
        const normalized = error instanceof Error ? error : new Error(String(error))
        if (this.#onLayoutError) this.#onLayoutError(name, normalized)
        else console.error(`Carousel: layout "${name}" failed`, normalized)
      }
    }
    if (this.#revision !== revision) return false
    this.#track.style.transform = 'none'
    for (const slot of slots) {
      const el = slot.element
      if (layout !== 'standard') {
        el.style[this.#vertical ? 'height' : 'width'] = slot.size + 'px'
        el.style[this.#vertical ? 'minHeight' : 'minWidth'] = slot.size + 'px'
        el.style.flexBasis = slot.size + 'px'
        writeSlideProgress(el, slot.progress)
      }
      el.style.transform = this.#vertical
        ? `translate3d(0, ${slot.offset}px, 0)` : `translate3d(${slot.offset}px, 0, 0)`
    }
    this.#lastSlots = slots
    return true
  }

  // Track animations are owned by Carousel's position controller.
  stopAnimation() {
    if (this.#track) this.#track.style.transition = 'none'
  }

  /** @param {import('./types').SlideData[]} slides @param {{ slidesPerView: number, gap: number, loop?: boolean, ariaLabel?: string, orientation?: 'horizontal' | 'vertical', viewportHeight?: number }} layout */
  rebuild(slides, layout, refreshContent = false) {
    if (!this.#track) return
    const revision = ++this.#revision
    this.#cancelObservedLayout()
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    this.#configureCopies(0) // discard old visual copies
    if (this.#revision !== revision) return
    this.#isLoop = layout.loop ?? false
    this.#root?.classList.toggle('carousel--loop', this.#isLoop)
    this.#root?.setAttribute('aria-label', layout.ariaLabel ?? 'Carousel')
    this.#configureOrientation(layout)

    // Reuse the original DOM nodes for unchanged SlideData objects.
    // A breakpoint change must not wipe focus, input state or listeners.
    const pool = new Map()
    for (let i = 0; i < this.#sourceSlides.length; i++) {
      const key = this.#sourceKeys[i]
      if (!pool.has(key)) pool.set(key, { entries: [], cursor: 0 })
      pool.get(key).entries.push({ element: this.#slideElements[i], content: this.#sourceContent[i] })
    }

    const next = []
    for (let index = 0; index < slides.length; index++) {
      const slide = slides[index]
      const key = layout.keys?.[index] ?? slide
      const matches = pool.get(key)
      const previous = matches?.entries[matches.cursor++]
      const el = previous ? previous.element : this.#createSlide(slide, index, slides.length)
      if (this.#revision !== revision) return
      if (previous && (refreshContent === true || refreshContent instanceof Set && refreshContent.has(key)
        || previous.content !== slide.content || !slide.lazy && el.dataset.rendered !== 'true')) {
        if (slide.lazy) this.#content.clear(el, index, () => this.#revision === revision)
        else this.#renderContent(el, slide, index)
        if (this.#revision !== revision) return
      }
      el.dataset.index = String(index)
      el.setAttribute('aria-label', String(index + 1) + ' of ' + slides.length)
      next.push(el)
    }

    // A stable ordering requires no DOM moves at all.
    const kept = new Set(next)
    if (!this.#content.releaseUnused(kept, () => this.#revision === revision)) return
    for (let i = 0; i < next.length; i++) {
      if (this.#track.children[i] !== next[i]) {
        moveElement(this.#track, next[i], this.#track.children[i] ?? null)
        if (this.#revision !== revision) return
      }
    }
    // A connected callback can interrupt an outer insertion before it publishes
    // its element snapshot. Reconcile the owned track, including those wrappers.
    for (const old of [...this.#track.children]) {
      if (!kept.has(old)) {
        old.remove()
        if (this.#revision !== revision) return
      }
    }

    this.#slideElements = next
    this.#sourceKeys = layout.keys ?? [...slides]
    this.#sourceSlides = [...slides]
    this.#sourceContent = slides.map(slide => slide.content)
    if (this.#isLoop) this.#track.style.transform = 'none'
    else this.#track.style.height = ''
    this.updateLayout(layout.slidesPerView, layout.gap)
    if (this.#revision !== revision) return
    this.#configureCopies(layout.visibleSlides ?? layout.slidesPerView)
    if (this.#revision !== revision) return
    this.#setupSlideResizeObserver()
  }

  /** @returns {HTMLElement | null} */
  getRoot() { return this.#root }
  /** @returns {HTMLElement | null} */
  getViewport() { return this.#viewport }
  /** @returns {HTMLElement | null} */
  getTrack() { return this.#track }
  /** @returns {HTMLElement[]} */
  getSlideElements() { return this.#slideElements }
  getPositionElements() { return this.#isLoop ? [...this.#slideElements, ...this.#copies] : this.#slideElements }
  /** @param {number} index @returns {HTMLElement | null} */
  getSlideElement(index) { return this.#slideElements[index] ?? null }

  destroy() {
    this.#revision++
    const root = this.#root
    const copies = this.#copies
    const report = this.#onRenderError
    this.#cancelObservedLayout()
    this.stopAnimation()
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    this.#onResize = null
    this.#onRenderError = null
    this.#onLayoutError = null
    this.#onGeometryError = null
    this.#geometry = null
    this.#lastSlots = null
    this.#copies = []
    this.#root = null
    this.#viewport = null
    this.#track = null
    this.#slideElements = []
    this.#sourceSlides = []
    this.#sourceContent = []
    this.#sourceKeys = []
    this.#document = null
    this.#view = null
    this.#content.destroy((index, error) => this.#reportRenderError(index, error, report))
    for (const copy of copies) copy.remove()
    root?.remove()
  }
}

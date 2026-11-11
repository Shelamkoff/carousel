import { isHTMLElement } from './dom.js'

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
  /** @type {((index: number, error: Error) => void) | null} */
  #onRenderError = null
  #document = null
  #view = null
  #revision = 0

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
    this.#configureCopies(layout.slidesPerView)
    this.updateLayout(layout.slidesPerView, layout.gap)
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
    if (!this.#isLoop || !this.#track) return
    const count = this.#slideElements.length
    // Fractional views still need one extra wrap slot while dragging.
    if (count === 0 || count > Math.ceil(perView)) return
    const cycles = Math.ceil(perView / count)
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
      copy.dataset.rendered = original.dataset.rendered
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
    if (!this.#isLoop) return
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
        this.#recalcSlideSize()
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

  /** @param {HTMLElement} el @param {import('./types').SlideData} slide @param {number} index */
  #renderContent(el, slide, index) {
    const revision = this.#revision
    el.classList.remove('carousel__slide--error')
    delete el.dataset.rendered
    el.replaceChildren()
    if (this.#revision !== revision) return
    try {
      if (typeof slide.content === 'string') el.innerHTML = slide.content
      else if (isHTMLElement(slide.content)) el.appendChild(slide.content.cloneNode(true))
      else if (typeof slide.content === 'function') {
        const content = slide.content()
        if (this.#revision !== revision) return
        if (!isHTMLElement(content)) throw new TypeError('Slide render function must return an HTMLElement')
        el.appendChild(content)
      }
      if (this.#revision !== revision) return
      el.dataset.rendered = 'true'
    } catch (error) {
      if (this.#revision !== revision) return
      el.replaceChildren()
      const normalized = error instanceof Error ? error : new Error(String(error))
      el.dataset.rendered = 'error'
      el.classList.add('carousel__slide--error')
      if (this.#onRenderError) this.#onRenderError(index, normalized)
      else console.error(`Carousel: failed to render slide ${index}`, normalized)
    }
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

  /** Keep orientation and viewport sizing together during atomic rebuilds. */
  #configureOrientation(layout) {
    this.#vertical = layout.orientation === 'vertical'
    this.#root?.classList.toggle('carousel--vertical', this.#vertical)
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
    this.#track.style.gap = this.#isLoop ? '' : gap + 'px'
    this.#recalcSlideSize()
  }

  #recalcSlideSize() {
    if (!this.#viewport) return
    const size = this.#measureViewportSize()
    this.#lastViewportSize = size
    this.#lastViewportCrossSize = this.#vertical ? this.#viewport.offsetWidth : 0
    const totalGap = this.#gap * (this.#slidesPerView - 1)
    this.#slideSize = Math.max(0, (size - totalGap) / this.#slidesPerView)

    for (const el of this.getPositionElements()) {
      el.style.width = this.#vertical ? '100%' : this.#slideSize + 'px'
      el.style.minWidth = this.#vertical ? '0' : this.#slideSize + 'px'
      el.style.height = this.#vertical ? this.#slideSize + 'px' : ''
      el.style.minHeight = this.#vertical ? this.#slideSize + 'px' : ''
      el.style.flexBasis = this.#slideSize + 'px'
      el.style.flexShrink = '0'
      el.style.flexGrow = '0'

      if (this.#isLoop) {
        // Loop: absolute positioning, LoopEngine controls transform
        el.style.position = 'absolute'
        el.style.top = '0'
        el.style.left = '0'
      } else {
        // Non-loop: ensure flex flow (clear any leftover absolute from rebuild)
        el.style.position = ''
        el.style.top = ''
        el.style.left = ''
        el.style.transform = ''
      }
    }

    this.#updateTrackHeight()
  }

  #updateTrackHeight() {
    if (!this.#track) return
    if (this.#vertical) {
      this.#track.style.height = this.#lastViewportSize + 'px'
      return
    }
    if (!this.#isLoop) return
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
    if (this.#isLoop || this.#vertical) this.#updateTrackHeight()
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
      const data = this.#sourceSlides[i]
      if (!pool.has(data)) pool.set(data, [])
      pool.get(data).push({ element: this.#slideElements[i], content: this.#sourceContent[i] })
    }

    const next = []
    for (let index = 0; index < slides.length; index++) {
      const slide = slides[index]
      const previous = pool.get(slide)?.shift()
      const el = previous ? previous.element : this.#createSlide(slide, index, slides.length)
      if (this.#revision !== revision) return
      if (previous && (refreshContent || previous.content !== slide.content)) {
        el.replaceChildren()
        if (this.#revision !== revision) return
        delete el.dataset.rendered
        delete el.dataset.loaded
        el.classList.remove('carousel__slide--error', 'carousel__slide--loaded')
        if (!slide.lazy) this.#renderContent(el, slide, index)
        if (this.#revision !== revision) return
      }
      el.dataset.index = String(index)
      el.setAttribute('aria-label', String(index + 1) + ' of ' + slides.length)
      next.push(el)
    }

    // A stable ordering requires no DOM moves at all.
    const kept = new Set(next)
    for (let i = 0; i < next.length; i++) {
      if (this.#track.children[i] !== next[i]) {
        this.#track.insertBefore(next[i], this.#track.children[i] ?? null)
        if (this.#revision !== revision) return
      }
    }
    for (const old of this.#slideElements) {
      if (!kept.has(old)) {
        old.remove()
        if (this.#revision !== revision) return
      }
    }

    this.#slideElements = next
    this.#sourceSlides = [...slides]
    this.#sourceContent = slides.map(slide => slide.content)
    this.#configureCopies(layout.slidesPerView)
    if (this.#revision !== revision) return
    if (this.#isLoop) this.#track.style.transform = 'none'
    else this.#track.style.height = ''
    this.updateLayout(layout.slidesPerView, layout.gap)
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
    this.#cancelObservedLayout()
    this.stopAnimation()
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    this.#onResize = null
    this.#onRenderError = null
    for (const copy of this.#copies) copy.remove()
    this.#copies = []
    this.#root?.remove()
    this.#root = null
    this.#viewport = null
    this.#track = null
    this.#slideElements = []
    this.#sourceSlides = []
    this.#sourceContent = []
    this.#document = null
    this.#view = null
  }
}

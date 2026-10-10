/**
 * DOM construction and positioning.
 * In loop mode: slides are absolutely positioned, each at `left: i * step`.
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
  #slidesPerView = 1
  /** @type {number} */
  #gap = 0
  /** @type {number} */
  #slideWidth = 0
  /** @type {((previousSlideWidth: number) => void) | null} */
  #onResize = null
  /** @type {number} */
  /** @type {boolean} */
  #isLoop = false
  /** @type {((index: number, error: Error) => void) | null} */
  #onRenderError = null

  /**
   * @param {HTMLElement} container
   * @param {import('./types').SlideData[]} slides
   * @param {{ slidesPerView: number, gap: number, loop?: boolean, ariaLabel?: string }} layout
   */
  build(container, slides, layout) {
    this.destroy()
    this.#isLoop = layout.loop ?? false

    const root = document.createElement('div')
    root.className = 'carousel' + (this.#isLoop ? ' carousel--loop' : '')
    root.setAttribute('role', 'region')
    root.setAttribute('aria-roledescription', 'carousel')
    root.setAttribute('aria-label', layout.ariaLabel ?? 'Carousel')

    const viewport = document.createElement('div')
    viewport.className = 'carousel__viewport'

    const track = document.createElement('div')
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
    const el = document.createElement('div')
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
    for (const node of this.#copies) node.remove()
    this.#copies = []
    if (!this.#isLoop || !this.#track) return
    const count = this.#slideElements.length
    if (count === 0 || count > perView) return
    const cycles = Math.ceil(perView / count)
    for (let cycle = 1; cycle <= cycles; cycle++) {
      for (let i = 0; i < count; i++) {
        const copy = /** @type {HTMLElement} */ (this.#slideElements[i].cloneNode(true))
        copy.dataset.carouselCopy = String(cycle)
        copy.setAttribute('aria-hidden', 'true')
        copy.inert = true
        this.#copies.push(copy)
        this.#track.appendChild(copy)
      }
    }
  }

  /** @param {number} index */
  #syncCopies(index) {
    const original = this.#slideElements[index]
    for (const copy of this.#copies) {
      if (Number(copy.dataset.index) !== index) continue
      copy.replaceChildren(...[...original.childNodes].map(node => node.cloneNode(true)))
      copy.dataset.rendered = original.dataset.rendered
    }
  }

  /** @type {number} */
  #lastViewportWidth = 0

  #setupResizeObserver() {
    if (!this.#viewport) return
    this.#lastViewportWidth = this.#viewport.offsetWidth
    this.#resizeObserver = new ResizeObserver(() => {
      if (!this.#viewport) return
      const w = this.#viewport.offsetWidth
      if (w === this.#lastViewportWidth) return // skip if size unchanged
      this.#lastViewportWidth = w
      const previousSlideWidth = this.#slideWidth
      this.#recalcSlideWidth()
      this.#onResize?.(previousSlideWidth)
    })
    this.#resizeObserver.observe(this.#viewport)
  }

  #setupSlideResizeObserver() {
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    if (!this.#isLoop) return
    this.#slideResizeObserver = new ResizeObserver(() => this.#updateTrackHeight())
    for (const slide of this.#slideElements) this.#slideResizeObserver.observe(slide)
  }

  /** @param {(previousSlideWidth: number) => void} cb */
  onResize(cb) { this.#onResize = cb }

  /** @param {(index: number, error: Error) => void} cb */
  onRenderError(cb) { this.#onRenderError = cb }

  /** @param {HTMLElement} el @param {import('./types').SlideData} slide @param {number} index */
  #renderContent(el, slide, index) {
    el.classList.remove('carousel__slide--error')
    delete el.dataset.rendered
    el.replaceChildren()
    try {
      if (typeof slide.content === 'string') el.innerHTML = slide.content
      else if (slide.content instanceof HTMLElement) el.appendChild(slide.content.cloneNode(true))
      else if (typeof slide.content === 'function') {
        const content = slide.content()
        if (!(content instanceof HTMLElement)) throw new TypeError('Slide render function must return an HTMLElement')
        el.appendChild(content)
      }
      el.dataset.rendered = 'true'
    } catch (error) {
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
    const el = this.#slideElements[trackIndex]
    if (!el) return false
    if (el.dataset.rendered === 'true') return true
    this.#renderContent(el, slide, trackIndex)
    if (el.dataset.rendered !== 'true') return false
    this.#syncCopies(trackIndex)
    this.refreshLayout()
    return true
  }

  /** @param {number} slidesPerView @param {number} gap */
  updateLayout(slidesPerView, gap) {
    if (!this.#viewport || !this.#track) return
    this.#slidesPerView = slidesPerView
    this.#gap = gap
    this.#root?.style.setProperty('--carousel-gap', gap + 'px')
    // Non-loop: flex gap for spacing. Loop: gap handled by LoopEngine step.
    this.#track.style.gap = this.#isLoop ? '' : gap + 'px'
    this.#recalcSlideWidth()
  }

  #recalcSlideWidth() {
    if (!this.#viewport) return
    const vw = this.#viewport.offsetWidth
    const totalGap = this.#gap * (this.#slidesPerView - 1)
    this.#slideWidth = Math.max(0, (vw - totalGap) / this.#slidesPerView)

    for (const el of this.getPositionElements()) {
      el.style.width = this.#slideWidth + 'px'
      el.style.minWidth = this.#slideWidth + 'px'
      el.style.flexBasis = this.#slideWidth + 'px'
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

    if (this.#isLoop && this.#track) {
      this.#updateTrackHeight()
    }
  }

  #updateTrackHeight() {
    if (!this.#isLoop || !this.#track) return
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
    if (this.#isLoop) this.#updateTrackHeight()
  }

  /** @returns {number} */
  get viewportWidth() { return this.#lastViewportWidth }
  /** @returns {number} */
  get slideWidth() { return this.#slideWidth }
  /** @returns {number} */
  get gap() { return this.#gap }
  /** @returns {number} */
  get slidesPerView() { return this.#slidesPerView }

  /** @param {number} offset */
  setPosition(offset) {
    if (!this.#track) return
    this.#track.style.transition = 'none'
    this.#track.style.transform = `translate3d(${offset}px, 0, 0)`
  }

  // Track animations are owned by Carousel's position controller.
  stopAnimation() {
    if (this.#track) this.#track.style.transition = 'none'
  }

  /** @param {import('./types').SlideData[]} slides @param {{ slidesPerView: number, gap: number, loop?: boolean, ariaLabel?: string }} layout */
  rebuild(slides, layout, refreshContent = false) {
    if (!this.#track) return
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    this.#configureCopies(0) // discard old visual copies
    this.#isLoop = layout.loop ?? false
    this.#root?.classList.toggle('carousel--loop', this.#isLoop)
    this.#root?.setAttribute('aria-label', layout.ariaLabel ?? 'Carousel')

    // Reuse the original DOM nodes for unchanged SlideData objects.
    // A breakpoint change must not wipe focus, input state or listeners.
    const pool = new Map()
    for (let i = 0; i < this.#sourceSlides.length; i++) {
      const data = this.#sourceSlides[i]
      if (!pool.has(data)) pool.set(data, [])
      pool.get(data).push({ element: this.#slideElements[i], content: this.#sourceContent[i] })
    }

    const next = slides.map((slide, index) => {
      const previous = pool.get(slide)?.shift()
      const el = previous ? previous.element : this.#createSlide(slide, index, slides.length)
      if (previous && (refreshContent || previous.content !== slide.content)) {
        el.replaceChildren()
        delete el.dataset.rendered
        delete el.dataset.loaded
        el.classList.remove('carousel__slide--error', 'carousel__slide--loaded')
        if (!slide.lazy) this.#renderContent(el, slide, index)
      }
      el.dataset.index = String(index)
      el.setAttribute('aria-label', String(index + 1) + ' of ' + slides.length)
      return el
    })

    // A stable ordering requires no DOM moves at all.
    const kept = new Set(next)
    for (let i = 0; i < next.length; i++) {
      if (this.#track.children[i] !== next[i]) {
        this.#track.insertBefore(next[i], this.#track.children[i] ?? null)
      }
    }
    for (const old of this.#slideElements) {
      if (!kept.has(old)) old.remove()
    }

    this.#slideElements = next
    this.#sourceSlides = [...slides]
    this.#sourceContent = slides.map(slide => slide.content)
    this.#configureCopies(layout.slidesPerView)
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
  }
}

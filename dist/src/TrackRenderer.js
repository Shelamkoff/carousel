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
  #slideWidth = 0
  /** @type {((previousSlideWidth: number) => void) | null} */
  #onResize = null
  /** @type {number} */
  #animTimer = 0
  /** @type {(() => void) | null} */
  #onCompleteGuard = null
  /** @type {boolean} */
  #isLoop = false
  /** @type {((index: number, error: Error) => void) | null} */
  #onRenderError = null

  /**
   * @param {HTMLElement} container
   * @param {import('./types').SlideData[]} slides
   * @param {{ slidesPerView: number, gap: number, loop?: boolean }} layout
   */
  build(container, slides, layout) {
    this.destroy()
    this.#isLoop = layout.loop ?? false

    const root = document.createElement('div')
    root.className = 'carousel' + (this.#isLoop ? ' carousel--loop' : '')
    root.setAttribute('role', 'region')
    root.setAttribute('aria-roledescription', 'carousel')

    const viewport = document.createElement('div')
    viewport.className = 'carousel__viewport'

    const track = document.createElement('div')
    track.className = 'carousel__track'

    this.#slideElements = slides.map((slide, i) => {
      const el = document.createElement('div')
      el.className = 'carousel__slide'
      el.setAttribute('role', 'group')
      el.setAttribute('aria-roledescription', 'slide')
      el.setAttribute('aria-label', `${i + 1} of ${slides.length}`)
      el.dataset.index = String(i)
      if (!slide.lazy) this.#renderContent(el, slide, i)
      return el
    })

    for (const el of this.#slideElements) track.appendChild(el)

    viewport.appendChild(track)
    root.appendChild(viewport)
    container.appendChild(root)

    this.#root = root
    this.#viewport = viewport
    this.#track = track

    this.updateLayout(layout.slidesPerView, layout.gap)
    this.#setupResizeObserver()
    this.#setupSlideResizeObserver()

    return { root, viewport, track }
  }

  /** @type {number} */
  #lastViewportWidth = 0

  #setupResizeObserver() {
    if (!this.#viewport) return
    this.#lastViewportWidth = this.#viewport.offsetWidth
    this.#resizeObserver = new ResizeObserver(() => {
      if (this.#viewport && this.#viewport.offsetWidth !== this.#lastViewportWidth) {
        this.#scheduleObservedLayout()
      }
    })
    this.#resizeObserver.observe(this.#viewport)
  }

  #setupSlideResizeObserver() {
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    if (!this.#isLoop) return
    this.#slideResizeObserver = new ResizeObserver(() => this.#scheduleObservedLayout())
    for (const slide of this.#slideElements) this.#slideResizeObserver.observe(slide)
  }

  #scheduleObservedLayout() {
    if (this.#observedLayoutFrame) return
    // Slide widths can change intrinsic media height and hence the observed
    // viewport. Apply layout outside ResizeObserver delivery to avoid a loop.
    this.#observedLayoutFrame = requestAnimationFrame(() => {
      this.#observedLayoutFrame = 0
      if (!this.#viewport) return
      const width = this.#viewport.offsetWidth
      if (width !== this.#lastViewportWidth) {
        this.#lastViewportWidth = width
        const previousSlideWidth = this.#slideWidth
        this.#recalcSlideWidth()
        this.#onResize?.(previousSlideWidth)
      } else {
        this.#updateTrackHeight()
      }
    })
  }

  #cancelObservedLayout() {
    if (this.#observedLayoutFrame) cancelAnimationFrame(this.#observedLayoutFrame)
    this.#observedLayoutFrame = 0
  }

  /** @param {(previousSlideWidth: number) => void} cb */
  onResize(cb) { this.#onResize = cb }

  /** @param {(index: number, error: Error) => void} cb */
  onRenderError(cb) { this.#onRenderError = cb }

  /** @param {HTMLElement} el @param {import('./types').SlideData} slide @param {number} index */
  #renderContent(el, slide, index) {
    el.classList.remove('carousel__slide--error')
    delete el.dataset.rendered
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
    if (!el || el.dataset.rendered === 'true') return
    this.#renderContent(el, slide, trackIndex)
    this.refreshLayout()
  }

  /** @param {number} slidesPerView @param {number} gap */
  updateLayout(slidesPerView, gap) {
    if (!this.#viewport || !this.#track) return
    this.#slidesPerView = slidesPerView
    this.#gap = gap
    // Non-loop: flex gap for spacing. Loop: gap handled by LoopEngine step.
    this.#track.style.gap = this.#isLoop ? '' : gap + 'px'
    this.#recalcSlideWidth()
  }

  #recalcSlideWidth() {
    if (!this.#viewport) return
    const vw = this.#viewport.offsetWidth
    this.#lastViewportWidth = vw
    const totalGap = this.#gap * (this.#slidesPerView - 1)
    this.#slideWidth = Math.max(0, (vw - totalGap) / this.#slidesPerView)

    for (let i = 0; i < this.#slideElements.length; i++) {
      const el = this.#slideElements[i]
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

  /**
   * @param {number} targetOffset
   * @param {number} duration
   * @param {() => void} [onComplete]
   */
  animateTo(targetOffset, duration, onComplete) {
    if (!this.#track) return
    this.stopAnimation()

    this.#track.style.transition = `transform ${duration}ms ease`
    void this.#track.offsetWidth
    this.#track.style.transform = `translate3d(${targetOffset}px, 0, 0)`

    let completed = false
    this.#animTimer = setTimeout(() => {
      if (completed) return
      completed = true
      this.#animTimer = 0
      this.#track.style.transition = 'none'
      onComplete?.()
    }, duration + 20)

    this.#onCompleteGuard = () => { completed = true }
  }

  stopAnimation() {
    if (this.#animTimer) { clearTimeout(this.#animTimer); this.#animTimer = 0 }
    if (this.#onCompleteGuard) { this.#onCompleteGuard(); this.#onCompleteGuard = null }
    if (this.#track) this.#track.style.transition = 'none'
  }

  /** @param {import('./types').SlideData[]} slides @param {{ slidesPerView: number, gap: number, loop?: boolean }} layout */
  rebuild(slides, layout) {
    if (!this.#track) return
    this.#cancelObservedLayout()
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    this.#isLoop = layout.loop ?? false
    this.#track.innerHTML = ''

    if (this.#root) {
      this.#root.classList.toggle('carousel--loop', this.#isLoop)
    }

    this.#slideElements = slides.map((slide, i) => {
      const el = document.createElement('div')
      el.className = 'carousel__slide'
      el.setAttribute('role', 'group')
      el.setAttribute('aria-roledescription', 'slide')
      el.setAttribute('aria-label', `${i + 1} of ${slides.length}`)
      el.dataset.index = String(i)
      if (!slide.lazy) this.#renderContent(el, slide, i)
      return el
    })
    for (const el of this.#slideElements) this.#track.appendChild(el)
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
  /** @param {number} index @returns {HTMLElement | null} */
  getSlideElement(index) { return this.#slideElements[index] ?? null }

  destroy() {
    this.#cancelObservedLayout()
    this.stopAnimation()
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#slideResizeObserver?.disconnect()
    this.#slideResizeObserver = null
    this.#onResize = null
    this.#onRenderError = null
    this.#root?.remove()
    this.#root = null
    this.#viewport = null
    this.#track = null
    this.#slideElements = []
  }
}

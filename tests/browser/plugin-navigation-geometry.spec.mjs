import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__plugin_geometry__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__plugin_geometry__')
  await page.evaluate(async () => {
    window.carouselApi = await import('/src/index.js')
    window.makeHost = width => {
      const host = document.createElement('div')
      host.style.width = `${width}px`
      document.body.appendChild(host)
      return host
    }
    window.variableGeometry = {
      name: 'variable cards',
      measure({ slides }) {
        let offset = 0
        return { slides: slides.map(({ meta }) => {
          const measurement = { offset, size: meta.size }
          offset += meta.size
          return measurement
        }) }
      },
    }
    window.slidesFor = sizes => sizes.map((size, index) => ({
      id: String(index), content: `<article style="height:100px">Card ${index + 1}</article>`, meta: { size },
    }))
  })
})

test('arrows, dots, autoplay and controls share custom physical page targets and bounds', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel, createArrows, createDots, createAutoplay, createControls } = window.carouselApi
    const host = window.makeHost(300)
    const autoplay = createAutoplay({ interval: 60000 })
    const carousel = new Carousel(host, window.slidesFor([80, 140, 160, 70, 150]), {
      geometry: window.variableGeometry, slidesPerScroll: 'auto', transitionDuration: 0,
      plugins: [createArrows(), createDots(), autoplay, createControls()],
    })
    try {
      await Promise.resolve()
      const previous = host.querySelector('.carousel__arrow--prev')
      const next = host.querySelector('.carousel__arrow--next')
      const play = host.querySelector('.carousel__play-pause')
      const dots = [...host.querySelectorAll('.carousel__dot')]
      const initial = { previous: previous.style.display, next: next.style.display,
        playing: autoplay.getState().running, disabled: play.disabled, dotCount: dots.length }
      next.click()
      const final = { index: carousel.getIndex(), position: carousel.getRenderState().position,
        last: carousel.getNavigationGeometry().lastIndex, previous: previous.style.display,
        next: next.style.display, playing: autoplay.getState().running,
        disabled: play.disabled, activePage: dots.findIndex(dot => dot.getAttribute('aria-current') === 'page') }
      dots[0].click()
      const firstPage = carousel.getIndex()
      dots[1].click()
      return { initial, final, firstPage, lastPage: carousel.getIndex() }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({
    initial: { previous: 'none', next: '', playing: true, disabled: false, dotCount: 2 },
    final: { index: 3, position: 300, last: 3, previous: '', next: 'none', playing: false, disabled: true, activePage: 1 },
    firstPage: 0, lastPage: 3,
  })
})

test('native pointer gestures use measured snaps, auto page policy and finite resistance', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Carousel, createSwipe } = window.carouselApi
    const outcomes = []
    for (const slidesPerScroll of [1, 'auto']) {
      const host = window.makeHost(250)
      const carousel = new Carousel(host, window.slidesFor([50, 50, 400, 350]), {
        geometry: window.variableGeometry, slidesPerScroll, transitionDuration: 0,
        plugins: [createSwipe({ mouse: true, threshold: 10, resistance: 0.3 })],
      })
      try {
        const pointer = (type, x) => {
          const event = new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: 0, clientX: x, clientY: 20, bubbles: true, cancelable: true })
          ;(type === 'pointerdown' ? host.querySelector('.carousel__viewport') : window).dispatchEvent(event)
        }
        pointer('pointerdown', 200)
        pointer('pointermove', slidesPerScroll === 'auto' ? 180 : 110)
        pointer('pointerup', slidesPerScroll === 'auto' ? 180 : 110)
        const selected = { index: carousel.getIndex(), position: carousel.getRenderState().position }
        carousel.goTo(0)
        pointer('pointerdown', 800)
        pointer('pointermove', 0)
        const resisted = carousel.getRenderState().position
        pointer('pointercancel', 0)
        outcomes.push({ slidesPerScroll, selected, resisted })
      } finally { carousel.destroy(); host.remove() }
    }
    return outcomes
  })
  expect(result).toEqual([
    { slidesPerScroll: 1, selected: { index: 2, position: 100 }, resisted: 590 },
    { slidesPerScroll: 'auto', selected: { index: 2, position: 100 }, resisted: 590 },
  ])
})

test('lazy preload materializes physical visible cards including partial forward loop copies', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Carousel, createLazyLoad } = window.carouselApi
    const NativeObserver = window.IntersectionObserver
    // Keep this deterministic: the preload policy must work before an observer callback.
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
    const outcomes = []
    try {
      for (const { width, sizes, loop, startIndex, expected } of [
        { width: 300, sizes: [100, 50, 100, 300, 75], loop: false, startIndex: 0, expected: [0, 1, 2, 3] },
        { width: 300, sizes: [100, 50, 100, 300, 75], loop: false, startIndex: 4, expected: [3, 4] },
        { width: 180, sizes: [80, 90, 70], loop: true, startIndex: 0, expected: [0, 1, 2] },
        { width: 400, sizes: [80, 90, 70], loop: true, startIndex: 0, expected: [0, 1, 2] },
      ]) {
        const host = window.makeHost(width)
        const rendered = []
        const slides = window.slidesFor(sizes).map((slide, index) => ({ ...slide, lazy: true, content: () => {
          rendered.push(index)
          const element = document.createElement('article')
          element.style.height = '100px'; element.textContent = String(index)
          return element
        } }))
        const carousel = new Carousel(host, slides, { geometry: window.variableGeometry,
          loop, startIndex, transitionDuration: 0, plugins: [createLazyLoad({ preload: 0 })] })
        try {
          const visible = carousel.getRenderState().slides.filter(slide => slide.offset < width && slide.offset + slide.size > 0)
          outcomes.push({ rendered, expected, visibleReady: visible.every(slide => slide.element.textContent !== '') })
        } finally { carousel.destroy(); host.remove() }
      }
      return outcomes
    } finally { window.IntersectionObserver = NativeObserver }
  })
  for (const outcome of result) {
    expect(outcome.rendered).toEqual(outcome.expected)
    expect(outcome.visibleReady).toBe(true)
  }
})

test('metadata and thumbnail updates retain thumbnail nodes, focus and the active animation', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Carousel, createThumbnails } = window.carouselApi
    const host = window.makeHost(300)
    const image = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    const carousel = new Carousel(host, window.slidesFor([100, 100, 100]).map((slide, index) => ({
      ...slide, thumb: `${image}#${index}`,
    })), { loop: true, transitionDuration: 1000, plugins: [createThumbnails()] })
    const changes = []
    let resizes = 0
    carousel.on('resize', () => resizes++)
    carousel.on('slides:change', change => changes.push({ updated: change.updated, fields: change.fields }))
    try {
      const strip = host.querySelector('.carousel__thumbnails')
      const buttons = [...strip.children]
      const images = buttons.map(button => button.firstElementChild)
      buttons[1].focus()
      carousel.next()
      const phaseBefore = carousel.getRenderState().phase
      const position = carousel.getRenderState().position
      const observer = new MutationObserver(() => {})
      observer.observe(strip, { childList: true, subtree: true, attributes: true })
      carousel.updateSlide(1, { meta: { title: 'Updated title' } })
      const metadataMutations = observer.takeRecords().length
      carousel.updateSlide(1, { thumb: `${image}#new` })
      const thumbnailMutations = observer.takeRecords().map(record => ({ type: record.type, attribute: record.attributeName }))
      const retained = buttons.every((button, index) => strip.children[index] === button && button.firstElementChild === images[index])
      const focused = document.activeElement === buttons[1]
      const sourceChanged = images[1].getAttribute('src') === `${image}#new`
      carousel.updateSlide(1, { thumb: undefined })
      const removedOnlyTarget = !buttons[1].firstElementChild && buttons[0].firstElementChild === images[0]
        && buttons[2].firstElementChild === images[2] && buttons.every((button, index) => strip.children[index] === button)
      observer.disconnect()
      return { phaseBefore, phaseAfter: carousel.getRenderState().phase, positionRetained: position === carousel.getRenderState().position,
        metadataMutations, thumbnailMutations, retained, focused, sourceChanged, removedOnlyTarget, resizes, changes }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({
    phaseBefore: 'animation', phaseAfter: 'animation', positionRetained: true,
    metadataMutations: 0, thumbnailMutations: [{ type: 'attributes', attribute: 'src' }],
    retained: true, focused: true, sourceChanged: true, removedOnlyTarget: true, resizes: 0,
    changes: [{ updated: [1], fields: ['meta'] }, { updated: [1], fields: ['thumb'] }, { updated: [1], fields: ['thumb'] }],
  })
})

import { test, expect } from '@playwright/test'

const errors = new WeakMap()
test.beforeEach(async ({ page }) => {
  const failures = []
  errors.set(page, failures)
  page.on('pageerror', error => failures.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.route('**/__continuous__', route => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html><head><link rel="stylesheet" href="/styles/carousel.css">
    <style>body{margin:0;padding:20px}#host{width:600px}article{height:140px;box-sizing:border-box;padding:20px;background:#def}</style>
    <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
    </head><body><div id="host"></div><button id="outside">Outside</button></body></html>` }))
  await page.goto('/__continuous__')
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
})
test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.fixture?.carousel.destroy())
  expect(errors.get(page)).toEqual([])
})

async function mount(page, model = {}) {
  await page.evaluate(async model => {
    const lib = await import('/src/index.js')
    const scroll = lib.createAutoScroll({ speed: 80, pauseOnHover: false, pauseOnFocus: false, ...model.scroll })
    const events = []
    const probe = { name: 'probe', install(context) { window.motionContext = context } }
    const swipe = model.swipe ? lib.createSwipe({ mouse: true }) : null
    const plugins = model.swipeFirst ? [swipe, scroll] : [scroll, swipe]
    const options = { loop: true, slidesPerView: 3, gap: 12, transitionDuration: 400,
      ...model.options, plugins: [probe, ...plugins.filter(Boolean), lib.createDots(), lib.createLazyLoad()] }
    if (model.surface) options.transition = lib.createSurfaceCrossfade()
    if (model.geometry) options.geometry = { name: 'unequal', measure({ count }) {
      let offset = 0
      return { slides: Array.from({ length: count }, (_, index) => {
        const size = [120, 260, 180][index % 3]
        const slide = { offset, size }; offset += size + 12; return slide
      }) }
    } }
    const host = document.querySelector('#host')
    const slides = Array.from({ length: model.count ?? 8 }, (_, index) => ({
      id: index, lazy: !!model.lazy,
      content: `<article><strong>Card ${index}</strong><input value="${index}" aria-label="Card ${index}"></article>`,
    }))
    const carousel = new lib.Carousel(host, slides, options)
    for (const name of ['slide:beforeChange', 'slide:change', 'transition:start', 'transition:end', 'motion:idle']) {
      carousel.on(name, payload => events.push({ name, ...payload }))
    }
    window.fixture = { carousel, scroll, host, events, lib }
  }, model)
}

const read = page => page.evaluate(() => {
  const { carousel, scroll } = window.fixture
  const frame = carousel.getRenderState()
  return { ...scroll.getState(), position: frame?.position, phase: frame?.phase,
    progress: frame?.transitionProgress, renderDirection: frame?.direction,
    index: carousel.getIndex(), selected: frame?.selectedIndex,
    length: carousel.getNavigationGeometry()?.loopLength,
    max: carousel.getNavigationGeometry()?.maxPosition }
})

for (const orientation of ['horizontal', 'vertical']) {
  for (const direction of ['forward', 'backward']) {
    test(`${orientation} ${direction} moves at a physical velocity without slide transitions`, async ({ page }) => {
      await mount(page, { scroll: { direction }, options: { orientation, viewportHeight: 360 } })
      const before = await read(page)
      await page.clock.runFor(1000)
      const after = await read(page)
      const traveled = direction === 'forward' ? after.position - before.position : before.position - after.position + after.length
      expect(traveled).toBeGreaterThan(78)
      expect(traveled).toBeLessThanOrEqual(81)
      expect(after).toMatchObject({ phase: 'scroll', running: true, progress: null,
        renderDirection: direction === 'forward' ? 1 : -1 })
      expect(await page.evaluate(() => window.fixture.events.filter(event => event.name.startsWith('transition:')))).toEqual([])
    })
  }
}

test('speed and direction updates preserve the current fractional position', async ({ page }) => {
  await mount(page)
  await page.clock.runFor(600)
  const before = await read(page)
  await page.evaluate(() => window.fixture.scroll.update({ speed: 160, direction: 'backward' }))
  expect((await read(page)).position).toBe(before.position)
  await page.clock.runFor(200)
  const after = await read(page)
  expect(before.position - after.position).toBeGreaterThan(29)
  expect(before.position - after.position).toBeLessThan(34)
  expect(after).toMatchObject({ speed: 160, direction: 'backward', running: true, renderDirection: -1 })
})

test('finite motion reaches the edge, remains still, and reverses without a reset', async ({ page }) => {
  await mount(page, { count: 4, options: { loop: false }, scroll: { speed: 600 } })
  await page.clock.runFor(1000)
  const edge = await read(page)
  expect(edge.position).toBe(edge.max)
  expect(edge).toMatchObject({ running: false, active: true, paused: true, phase: 'idle' })
  await page.clock.runFor(3000)
  expect((await read(page)).position).toBe(edge.position)
  await page.evaluate(() => window.fixture.scroll.update({ direction: 'backward' }))
  await page.clock.runFor(100)
  expect((await read(page)).position).toBeLessThan(edge.position - 45)
  await page.clock.runFor(600)
  expect(await read(page)).toMatchObject({ position: 0, running: false, phase: 'idle' })
})

test('selection, dots and lazy content follow continuous crossings without fake transitions', async ({ page }) => {
  await mount(page, { lazy: true, scroll: { speed: 500 } })
  await page.clock.runFor(1800)
  const state = await read(page)
  expect(state.index).toBeGreaterThan(0)
  expect(state.selected).toBe(state.index)
  const result = await page.evaluate(() => {
    const { carousel, events, host } = window.fixture
    return { loaded: carousel.getSlideElement().dataset.loaded,
      dot: [...host.querySelectorAll('.carousel__dot')].findIndex(dot => dot.classList.contains('carousel__dot--active')),
      changes: events.filter(event => event.name === 'slide:change').length,
      starts: events.filter(event => event.name === 'slide:beforeChange' || event.name === 'transition:start').length }
  })
  expect(result.loaded).toBe('true')
  expect(result.dot).toBe(state.index)
  expect(result.changes).toBeGreaterThan(1)
  expect(result.starts).toBe(0)
})

test('hover, focus, visibility and explicit stop preserve the exact paused position', async ({ page }) => {
  await mount(page, { scroll: { pauseOnHover: true, pauseOnFocus: true } })
  await page.clock.runFor(200)
  await page.evaluate(() => window.fixture.host.querySelector('.carousel').dispatchEvent(new MouseEvent('mouseenter')))
  const hovered = await read(page)
  await page.clock.runFor(800)
  expect((await read(page)).position).toBe(hovered.position)
  expect(hovered).toMatchObject({ paused: true, running: false })
  await page.evaluate(() => window.fixture.host.querySelector('.carousel').dispatchEvent(new MouseEvent('mouseleave')))
  await page.clock.runFor(200)
  expect((await read(page)).position).toBeGreaterThan(hovered.position)
  await page.locator('input').first().focus()
  const focused = await read(page)
  await page.clock.runFor(500)
  expect((await read(page)).position).toBe(focused.position)
  await page.locator('#outside').focus()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hidden = await read(page)
  await page.clock.runFor(60_000)
  expect((await read(page)).position).toBe(hidden.position)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(200)
  expect((await read(page)).position - hidden.position).toBeLessThan(18)
  await page.evaluate(() => window.fixture.scroll.stop())
  const stopped = await read(page)
  await page.clock.runFor(1000)
  expect(await read(page)).toMatchObject({ position: stopped.position, active: false, running: false })
  await page.evaluate(() => window.fixture.scroll.start())
  await page.clock.runFor(200)
  expect((await read(page)).position).toBeGreaterThan(stopped.position)
})

test('reduced motion blocks automatic and explicit movement until the preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount(page)
  await page.clock.runFor(1000)
  expect(await read(page)).toMatchObject({ position: 0, reducedMotion: true, active: true, running: false })
  await page.evaluate(() => window.fixture.scroll.start())
  await page.clock.runFor(200)
  expect((await read(page)).position).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.evaluate(() => window.fixture.scroll.getState().reducedMotion)).toBe(false)
  await page.clock.runFor(1000)
  expect((await read(page)).position).toBeGreaterThan(0)
})

for (const transition of ['slide', 'fade', 'stairs', 'surface']) {
  test(`manual ${transition} navigation temporarily owns the clock and scrolling resumes`, async ({ page }) => {
    await mount(page, { surface: transition === 'surface', options: { slidesPerView: 1,
      transition: transition === 'surface' ? 'slide' : transition } })
    await page.clock.runFor(200)
    await page.evaluate(() => window.fixture.carousel.next())
    expect((await read(page)).phase).toBe('animation')
    await page.clock.runFor(700)
    const state = await read(page)
    expect(state).toMatchObject({ running: true, phase: 'scroll', index: 1 })
    expect(state.position).toBeGreaterThan(612)
    expect(await page.evaluate(() => window.fixture.events.filter(event => event.name === 'transition:end').length)).toBe(1)
    expect(await page.evaluate(() => window.fixture.host.querySelectorAll('.carousel__surface, .carousel__transition').length)).toBe(0)
  })
}

for (const swipeFirst of [false, true]) {
  test(`pointer release resumes after swipe settles, swipeFirst=${swipeFirst}`, async ({ page }) => {
    await mount(page, { swipe: true, swipeFirst })
    await page.clock.runFor(200)
    const held = await page.evaluate(() => {
      const viewport = window.fixture.host.querySelector('.carousel__viewport')
      const pointer = { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true, clientX: 240, clientY: 90 }
      viewport.dispatchEvent(new PointerEvent('pointerdown', pointer))
      window.fixture.pointer = pointer
      return window.fixture.carousel.getRenderState().position
    })
    await page.clock.runFor(500)
    expect((await read(page)).position).toBe(held)
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', window.fixture.pointer)))
    await page.clock.runFor(800)
    expect(await read(page)).toMatchObject({ running: true, phase: 'scroll' })
  })
}

test('resize preserves fractional geometry and collections restart the same requested controller', async ({ page }) => {
  await mount(page, { geometry: true, scroll: { speed: 90 } })
  await page.clock.runFor(400)
  const before = await read(page)
  await page.evaluate(() => { window.fixture.host.style.width = '480px' })
  await page.clock.runFor(50)
  const after = await read(page)
  expect(after.position).toBeGreaterThan(before.position - 1)
  expect(after.position).toBeLessThan(before.position + 8)
  await page.evaluate(() => {
    const carousel = window.fixture.carousel
    carousel.moveSlide(6, 2)
    carousel.updateSlide(3, { content: '<article>Replaced</article>' })
  })
  await page.clock.runFor(100)
  expect(await read(page)).toMatchObject({ running: true, phase: 'scroll' })
  await page.evaluate(() => window.fixture.carousel.setSlides([]))
  await page.clock.runFor(100)
  expect(await read(page)).toMatchObject({ running: false, active: true, phase: 'idle' })
  await page.evaluate(() => window.fixture.carousel.setSlides([{ id: 'one', content: '<article>Only card</article>' }]))
  await page.clock.runFor(100)
  expect(await read(page)).toMatchObject({ running: true, phase: 'scroll' })
})

test('removing a scoped controller cancels its frame and does not stop a newer navigation', async ({ page }) => {
  await mount(page, { scroll: { autoStart: false } })
  await page.evaluate(() => {
    window.fixture.motion = window.motionContext.startContinuousScroll(100)
  })
  await page.clock.runFor(200)
  await page.evaluate(() => {
    window.fixture.carousel.next()
    window.fixture.carousel.unuse('probe')
    window.fixture.motion.stop()
  })
  expect((await read(page)).phase).toBe('animation')
  await page.clock.runFor(500)
  expect((await read(page)).index).toBe(1)
  await page.evaluate(() => window.fixture.scroll.start())
  await page.clock.runFor(200)
  await page.evaluate(() => window.fixture.carousel.unuse('autoscroll'))
  const removed = await read(page)
  await page.clock.runFor(500)
  expect(await read(page)).toMatchObject({ position: removed.position, available: false, running: false, phase: 'idle' })
})

test('autoplay and continuous playback are rejected in either installation order', async ({ page }) => {
  await mount(page)
  const result = await page.evaluate(() => {
    const { carousel, lib } = window.fixture
    const messages = []
    try { carousel.use(lib.createAutoplay()) } catch (error) { messages.push(error.message) }
    carousel.unuse('autoscroll')
    carousel.use(lib.createAutoplay())
    try { carousel.use(lib.createAutoScroll()) } catch (error) { messages.push(error.message) }
    return messages
  })
  expect(result).toHaveLength(2)
  expect(result.every(message => message.includes('autoplay and autoscroll'))).toBe(true)
})

import { test, expect } from '@playwright/test'

const errors = new WeakMap()
test.beforeEach(async ({ page }) => {
  const failures = []
  errors.set(page, failures)
  page.on('pageerror', error => failures.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.route('**/__scroll_reentry__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/styles/carousel.css">
      <style>#host{width:600px}article{height:160px}</style>
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
      </head><body><div id="host"></div></body></html>`,
  }))
  await page.goto('/__scroll_reentry__')
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
  await page.evaluate(async () => {
    const lib = await import('/src/index.js')
    const slides = Array.from({ length: 8 }, (_, index) => ({ content: `<article>${index}</article>` }))
    let context
    const carousel = new lib.Carousel(document.querySelector('#host'), slides, {
      loop: true, transitionDuration: 400,
      plugins: [{ name: 'position-controller', install(ctx) { context = ctx } }],
    })
    window.scrollReentry = { lib, carousel, context }
  })
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.scrollReentry?.carousel.destroy())
  expect(errors.get(page)).toEqual([])
})

for (const firstName of ['autoscroll', 'autoplay']) {
  test(`reentrant ${firstName} installation rejects the other playback controller`, async ({ page }) => {
    const result = await page.evaluate(firstName => {
      const { lib, carousel } = window.scrollReentry
      const create = name => name === 'autoscroll'
        ? lib.createAutoScroll({ pauseOnHover: false, pauseOnFocus: false })
        : lib.createAutoplay({ pauseOnHover: false, pauseOnFocus: false })
      const secondName = firstName === 'autoscroll' ? 'autoplay' : 'autoscroll'
      const first = create(firstName)
      const second = create(secondName)
      let attempted = false
      let message = null
      carousel.on(`${firstName}:state`, () => {
        if (attempted) return
        attempted = true
        try { carousel.use(second) } catch (error) { message = error.message }
      })
      carousel.use(first)
      const installed = { first: carousel.getPlugin(firstName) === first, second: !!carousel.getPlugin(secondName) }
      carousel.unuse(firstName)
      carousel.use(second)
      return { attempted, message, installed, reusable: carousel.getPlugin(secondName) === second }
    }, firstName)
    expect(result).toEqual({
      attempted: true,
      message: 'Carousel: autoplay and autoscroll cannot run on the same carousel',
      installed: { first: true, second: false },
      reusable: true,
    })
  })
}

test('start requested by an idle render callback begins after the event batch', async ({ page }) => {
  await page.evaluate(() => {
    const fixture = window.scrollReentry
    fixture.scroll = fixture.lib.createAutoScroll({ autoStart: false, pauseOnHover: false, pauseOnFocus: false })
    fixture.carousel.use(fixture.scroll)
    let started = false
    fixture.carousel.on('render', frame => {
      if (!started && frame.phase === 'idle') {
        started = true
        fixture.scroll.start()
      }
    })
    fixture.context.setPosition(17)
  })
  expect(await page.evaluate(() => ({
    state: window.scrollReentry.scroll.getState(),
    position: window.scrollReentry.carousel.getRenderState().position,
    phase: window.scrollReentry.carousel.getRenderState().phase,
  }))).toMatchObject({ state: { active: true, running: true, paused: false }, position: 17, phase: 'scroll' })
  await page.clock.runFor(200)
  expect(await page.evaluate(() => window.scrollReentry.carousel.getRenderState().position)).toBeGreaterThan(23)
})

test('installing a controller from an idle render callback starts without a later resize', async ({ page }) => {
  await page.evaluate(() => {
    const fixture = window.scrollReentry
    let installed = false
    fixture.carousel.on('render', frame => {
      if (!installed && frame.phase === 'idle') {
        installed = true
        fixture.scroll = fixture.lib.createAutoScroll({ pauseOnHover: false, pauseOnFocus: false })
        fixture.carousel.use(fixture.scroll)
      }
    })
    fixture.context.setPosition(31)
  })
  expect(await page.evaluate(() => window.scrollReentry.scroll.getState())).toMatchObject({ active: true, running: true })
  await page.clock.runFor(200)
  expect(await page.evaluate(() => window.scrollReentry.carousel.getRenderState().position)).toBeGreaterThan(37)
})

test('a motion retired during its first render cannot later stop replacement navigation', async ({ page }) => {
  const state = await page.evaluate(() => {
    const fixture = window.scrollReentry
    let replaced = false
    fixture.carousel.on('render', frame => {
      if (!replaced && frame.phase === 'scroll') {
        replaced = true
        fixture.context.stopAnimation()
        fixture.carousel.goTo(3)
      }
    })
    fixture.retired = fixture.context.startContinuousScroll(40)
    return { replaced, oldRunning: fixture.retired.isRunning() }
  })
  expect(state).toEqual({ replaced: true, oldRunning: false })
  await page.clock.runFor(100)
  await page.evaluate(() => window.scrollReentry.retired.stop())
  expect(await page.evaluate(() => window.scrollReentry.carousel.getRenderState().phase)).toBe('animation')
  await page.clock.runFor(400)
  expect(await page.evaluate(() => ({
    index: window.scrollReentry.carousel.getIndex(),
    phase: window.scrollReentry.carousel.getRenderState().phase,
  }))).toEqual({ index: 3, phase: 'idle' })
})

test('removing a custom controller scope retires its motion without a destroy hook', async ({ page }) => {
  await page.evaluate(() => {
    const fixture = window.scrollReentry
    fixture.carousel.use({ name: 'bare-controller', install(context) {
      fixture.bareContext = context
      fixture.handle = context.startContinuousScroll(80)
    } })
  })
  await page.clock.runFor(200)
  const stopped = await page.evaluate(() => {
    const fixture = window.scrollReentry
    fixture.carousel.unuse('bare-controller')
    const revoked = fixture.bareContext.startContinuousScroll(120)
    return { revoked, running: fixture.handle.isRunning(), position: fixture.carousel.getRenderState().position,
      phase: fixture.carousel.getRenderState().phase }
  })
  expect(stopped.running).toBe(false)
  expect(stopped.revoked).toBeNull()
  expect(stopped.phase).toBe('idle')
  await page.clock.runFor(500)
  expect(await page.evaluate(() => window.scrollReentry.carousel.getRenderState().position)).toBe(stopped.position)
})

test('scope removal during the initial scroll render retires the not-yet-returned handle', async ({ page }) => {
  const stopped = await page.evaluate(() => {
    const fixture = window.scrollReentry
    let removed = false
    fixture.carousel.on('render', frame => {
      if (!removed && frame.phase === 'scroll') {
        removed = fixture.carousel.unuse('position-controller')
      }
    })
    const handle = fixture.context.startContinuousScroll(80)
    return { removed, running: handle?.isRunning() ?? false, position: fixture.carousel.getRenderState().position,
      phase: fixture.carousel.getRenderState().phase }
  })
  expect(stopped).toMatchObject({ removed: true, running: false, phase: 'idle' })
  await page.clock.runFor(500)
  expect(await page.evaluate(() => window.scrollReentry.carousel.getRenderState().position)).toBe(stopped.position)
})

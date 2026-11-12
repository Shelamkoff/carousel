import { test, expect } from '@playwright/test'

const pageErrors = new WeakMap()

test.beforeEach(async ({ page }) => {
  const errors = []
  pageErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.route('**/__surface_transitions__', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <link rel="stylesheet" href="/styles/carousel.css">
    <style>#surface-host{width:400px}#surface-host article{height:180px}</style>
    <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
    <form id="surface-host"></form>` }))
  await page.goto('/__surface_transitions__')
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.surfaceTest?.carousel.destroy())
  expect(pageErrors.get(page)).toEqual([])
})

async function mount(page, options = {}) {
  await page.evaluate(async options => {
    const { Carousel } = await import('/src/index.js')
    const host = document.querySelector('#surface-host')
    const contents = Array.from({ length: 3 }, (_, index) => {
      const element = document.createElement('article')
      element.innerHTML = `<label>Slide ${index}<input name="field-${index}" value="value-${index}"></label><video muted controls></video>`
      return element
    })
    let context
    const fixture = { host, contents, frames: [], instances: [], events: [], errors: [], disposed: 0 }
    const transition = { kind: 'surfaces', name: 'integration', commitAt: options.commitAt,
      createSurfaces(surfaces) {
        fixture.instances.push(surfaces)
        fixture.createHook?.(surfaces)
        return {
          render(progress) {
            fixture.frames.push({ progress, index: fixture.carousel.getIndex(), toIndex: surfaces.toIndex })
            fixture.renderHook?.(progress, surfaces)
          },
          destroy() { fixture.disposed++; fixture.destroyHook?.() },
        }
      },
    }
    const carousel = new Carousel(host, contents.map((content, index) => ({ id: index, content: () => content })), {
      transition, transitionDuration: 160, ...options,
      plugins: [{ name: 'surface-test', install(value) { context = value } }],
    })
    Object.assign(fixture, { carousel, context })
    carousel.on('slide:beforeChange', ({ fromIndex, toIndex }) => fixture.events.push(['before', fromIndex, toIndex]))
    carousel.on('transition:start', ({ fromIndex, toIndex }) => fixture.events.push(['start', fromIndex, toIndex]))
    carousel.on('transition:end', ({ index }) => fixture.events.push(['end', index]))
    carousel.on('slide:change', ({ prevIndex, index }) => fixture.events.push(['change', prevIndex, index]))
    carousel.on('transition:error', ({ name, error }) => fixture.errors.push([name, error.message]))
    window.surfaceTest = fixture
  }, options)
  await page.clock.runFor(32)
}

async function state(page) {
  return page.evaluate(() => {
    const f = window.surfaceTest
    return { index: f.carousel.getIndex(), phase: f.carousel.getRenderState()?.phase,
      events: f.events, errors: f.errors, disposed: f.disposed, frames: f.frames,
      overlays: f.host.querySelectorAll('.carousel__transition').length,
      visibility: f.context.getTrack()?.style.visibility,
      opacity: f.context.getTrack()?.style.opacity,
      pointerEvents: f.context.getTrack()?.style.pointerEvents,
      originals: f.contents.every((node, index) => f.carousel.getSlideElement(index)?.contains(node)),
    }
  })
}

for (const commitAt of [0, .35, 1]) {
  test(`surface navigation commits exactly at ${commitAt} and completes once`, async ({ page }) => {
    await mount(page, { commitAt })
    await page.evaluate(() => window.surfaceTest.carousel.next())
    await page.clock.runFor(32)
    expect((await state(page)).index).toBe(commitAt === 0 ? 1 : 0)
    await page.clock.runFor(250)
    const result = await state(page)
    expect(result).toMatchObject({ index: 1, phase: 'idle', errors: [], disposed: 1, overlays: 0,
      visibility: '', opacity: '', pointerEvents: '', originals: true,
      events: [['before', 0, 1], ['start', 0, 1], ['end', 1], ['change', 0, 1]] })
    expect(result.frames.filter(frame => frame.progress === commitAt)).toEqual([{ progress: commitAt, index: 0, toIndex: 1 }])
    expect(result.frames.at(-1).progress).toBe(1)
  })
}

test('loop reverse navigation captures the logical destination and direction', async ({ page }) => {
  await mount(page, { loop: true, orientation: 'vertical', viewportHeight: 220 })
  const captured = await page.evaluate(() => {
    const f = window.surfaceTest
    f.carousel.prev()
    const context = f.instances[0]
    return { from: context.fromIndex, to: context.toIndex, direction: context.direction,
      orientation: context.orientation, size: context.viewportSize,
      outgoing: context.from.querySelector('input').value, incoming: context.to.querySelector('input').value }
  })
  expect(captured).toEqual({ from: 0, to: 2, direction: -1, orientation: 'vertical', size: 220,
    outgoing: 'value-0', incoming: 'value-2' })
  await page.clock.runFor(250)
  expect(await state(page)).toMatchObject({ index: 2, disposed: 1, overlays: 0, visibility: '', originals: true, errors: [] })
})

test('resize retires snapshots and settles the intended destination once', async ({ page }) => {
  await mount(page, { transitionDuration: 2000 })
  await page.evaluate(() => { const f = window.surfaceTest; f.carousel.goTo(2); f.host.style.width = '260px' })
  // Native ResizeObserver delivery schedules a clock-controlled layout frame.
  // Advance those frames while polling instead of pausing its pending callback.
  await expect.poll(async () => { await page.clock.runFor(16); return (await state(page)).disposed }).toBe(1)
  expect((await state(page)).frames.at(-1).progress).toBeLessThan(1)
  await page.clock.runFor(2300)
  expect(await state(page)).toMatchObject({ index: 2, disposed: 1, overlays: 0, visibility: '', errors: [],
    events: [['before', 0, 2], ['start', 0, 2], ['end', 2], ['change', 0, 2]] })
})

for (const action of ['update', 'remove', 'destroy']) {
  test(`${action} cancels a surface without stale completion events`, async ({ page }) => {
    await mount(page)
    await page.evaluate(action => {
      const f = window.surfaceTest
      f.carousel.next()
      if (action === 'update') f.carousel.update({ gap: 14 })
      if (action === 'remove') f.carousel.removeSlide(1)
      if (action === 'destroy') f.carousel.destroy()
    }, action)
    await page.clock.runFor(300)
    const result = await state(page)
    expect(result).toMatchObject({ disposed: 1, overlays: 0, errors: [], events: [['before', 0, 1], ['start', 0, 1]] })
    if (action !== 'destroy') expect(result).toMatchObject({ visibility: '', opacity: '', pointerEvents: '' })
  })
}

test('a newer finite navigation owns the only completion and visible track', async ({ page }) => {
  await mount(page)
  await page.evaluate(() => window.surfaceTest.carousel.next())
  await page.clock.runFor(32)
  await page.evaluate(() => window.surfaceTest.carousel.goTo(2))
  await page.clock.runFor(300)
  expect(await state(page)).toMatchObject({ index: 2, disposed: 2, overlays: 0, visibility: '', errors: [],
    events: [['before', 0, 1], ['start', 0, 1], ['before', 0, 2], ['start', 0, 2], ['end', 2], ['change', 0, 2]] })
})

for (const hook of ['createHook', 'renderHook', 'destroyHook']) {
  test(`reconfiguration from ${hook} cannot complete an obsolete transition`, async ({ page }) => {
    await mount(page)
    await page.evaluate(hook => {
      const f = window.surfaceTest
      f[hook] = () => {
        delete f[hook]
        f.carousel.update({ transition: 'slide', transitionDuration: 0 })
        f.carousel.goTo(2)
      }
      f.carousel.next()
    }, hook)
    await page.clock.runFor(300)
    const result = await state(page)
    expect(result).toMatchObject({ index: 2, disposed: 1, overlays: 0, visibility: '', opacity: '', pointerEvents: '', errors: [] })
    expect(result.events.filter(event => event[0] === 'end')).toEqual([['end', 2]])
    expect(result.events.filter(event => event[0] === 'change')).toHaveLength(1)
  })
}

for (const hook of ['createHook', 'renderHook', 'destroyHook']) {
  test(`surface failure in ${hook} restores the track and preserves navigability`, async ({ page }) => {
    await mount(page)
    await page.evaluate(hook => {
      const f = window.surfaceTest
      f[hook] = () => { throw new Error(`failed ${hook}`) }
      f.carousel.next()
    }, hook)
    await page.clock.runFor(300)
    const result = await state(page)
    expect(result).toMatchObject({ index: 1, overlays: 0, visibility: '', opacity: '', pointerEvents: '',
      errors: [['integration', `failed ${hook}`]], disposed: hook === 'createHook' ? 0 : 1 })
    expect(result.events.filter(event => event[0] === 'end')).toEqual([['end', 1]])
    await page.evaluate(() => { const f = window.surfaceTest; f.carousel.update({ transition: 'slide', transitionDuration: 0 }); f.carousel.prev() })
    expect((await state(page)).index).toBe(0)
  })
}

for (const mode of ['zero', 'reduced']) {
  test(`${mode} motion navigation bypasses snapshot creation`, async ({ page }) => {
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount(page, mode === 'zero' ? { transitionDuration: 0 } : {})
    await page.evaluate(() => window.surfaceTest.carousel.next())
    expect(await state(page)).toMatchObject({ index: 1, phase: 'idle', frames: [], disposed: 0,
      overlays: 0, visibility: '', originals: true, errors: [],
      events: [['before', 0, 1], ['start', 0, 1], ['end', 1], ['change', 0, 1]] })
  })
}

test('surface playback retains focused native controls and original media nodes', async ({ page }) => {
  await mount(page)
  await page.evaluate(() => {
    const f = window.surfaceTest
    f.focused = f.contents[0].querySelector('input')
    f.media = f.contents[0].querySelector('video')
    f.media.volume = .4
    f.focused.value = 'active input'
    f.focused.focus()
    f.carousel.next()
  })
  await page.clock.runFor(48)
  const active = await page.evaluate(() => {
    const f = window.surfaceTest
    return { focused: document.activeElement === f.focused, mediaRetained: f.media === f.contents[0].querySelector('video'),
      mediaConnected: f.media.isConnected, volume: f.media.volume,
      snapshotValue: f.instances[0].from.querySelector('input').value, form: [...new FormData(f.host)] }
  })
  expect(active).toEqual({ focused: true, mediaRetained: true, mediaConnected: true, volume: .4,
    snapshotValue: 'active input', form: [['field-0', 'active input'], ['field-1', 'value-1'], ['field-2', 'value-2']] })
  await page.clock.runFor(250)
  expect(await state(page)).toMatchObject({ originals: true, opacity: '', pointerEvents: '' })
})

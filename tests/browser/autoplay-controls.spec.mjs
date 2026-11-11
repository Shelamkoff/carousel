import { test, expect } from '@playwright/test'

const pageErrors = new WeakMap()

test.beforeEach(async ({ page }) => {
  const errors = []
  pageErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.route('**/__autoplay_controls__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <style>body{margin:0;padding:24px}#controls-host{width:540px;max-width:100%}#controls-host article{height:180px;padding:24px;box-sizing:border-box;background:#def}#outside-control{margin-top:32px}</style>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
    </head><body><div id="controls-host"></div><button id="outside-control">Outside carousel</button></body></html>`,
  }))
  await page.goto('/__autoplay_controls__')
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.controlsFixture?.carousel.destroy())
  expect(pageErrors.get(page)).toEqual([])
})

async function mount(page, model = {}) {
  await page.evaluate(async model => {
    const { Carousel, createAutoplay, createControls, createSwipe, createKeyboard } = await import('/src/index.js')
    const autoplay = model.autoplay === false ? null : createAutoplay({ interval: 1000, ...model.autoplay })
    const controls = createControls(model.controls)
    const presentation = model.autoplayFirst ? [autoplay, controls] : [controls, autoplay]
    const host = document.querySelector('#controls-host')
    const carousel = new Carousel(host, Array.from({ length: model.count ?? 7 }, (_, index) => ({
      content: `<article><strong>Slide ${index + 1}</strong><label> Caption <input aria-label="Caption ${index + 1}" value="Read this slide"></label></article>`,
    })), {
      loop: true,
      transitionDuration: 0,
      ...model.options,
      plugins: [...presentation.filter(Boolean), createSwipe({ mouse: true }), createKeyboard()],
    })
    window.controlsFixture = { carousel, autoplay, controls, host }
  }, model)
}

const readState = page => page.evaluate(() => ({
  ...window.controlsFixture.autoplay.getState(),
  index: window.controlsFixture.carousel.getIndex(),
}))

test('autoplay circle freezes on hover and resumes the same remaining display time', async ({ page }) => {
  await mount(page)
  const progress = page.getByRole('progressbar', { name: 'Time elapsed on this slide' })
  await page.clock.runFor(250)
  expect(await readState(page)).toMatchObject({ index: 0, remaining: 750, progress: 0.25, running: true })
  await expect(progress).toHaveAttribute('aria-valuenow', /2[3-5]/)
  await page.locator('#controls-host').hover({ position: { x: 10, y: 10 } })
  await page.clock.runFor(2000)
  expect(await readState(page)).toMatchObject({ index: 0, remaining: 750, progress: 0.25, paused: true, running: false })
  await expect(progress).toHaveAttribute('aria-valuenow', '25')
  await page.mouse.move(1100, 700)
  await page.clock.runFor(749)
  expect((await readState(page)).index).toBe(0)
  await page.clock.runFor(1)
  expect(await readState(page)).toMatchObject({ index: 1, remaining: 1000, progress: 0, running: true })
  await expect(page.locator('.carousel__counter')).toHaveText('2 / 7')
})

test('overlay Play/Pause handles native pointer and focus without restarting on Pause', async ({ page }) => {
  await mount(page, { controls: { position: 'overlay' } })
  await page.clock.runFor(250)
  await page.getByRole('button', { name: 'Pause autoplay' }).click()
  expect(await readState(page)).toMatchObject({ index: 0, active: false, running: false, remaining: 750 })
  await page.clock.runFor(3000)
  expect((await readState(page)).remaining).toBe(750)
  await page.getByRole('button', { name: 'Play autoplay' }).click()
  expect(await readState(page)).toMatchObject({ active: true, running: true, remaining: 750 })
  await page.clock.runFor(749)
  expect((await readState(page)).index).toBe(0)
  await page.clock.runFor(1)
  expect((await readState(page)).index).toBe(1)
  await page.getByRole('button', { name: 'Pause autoplay' }).click()
  expect((await readState(page)).active).toBe(false)
})

test('Play works from keyboard focus and moving focus into a slide pauses safely', async ({ page }) => {
  await mount(page, { autoplay: { pauseOnHover: false } })
  const pause = page.getByRole('button', { name: 'Pause autoplay' })
  await pause.focus()
  await page.keyboard.press('Enter')
  expect((await readState(page)).active).toBe(false)
  await page.keyboard.press('Enter')
  expect((await readState(page)).running).toBe(true)
  await page.clock.runFor(300)
  await page.getByRole('textbox', { name: 'Caption 1', exact: true }).focus()
  expect((await readState(page)).paused).toBe(true)
  await page.keyboard.press('Home')
  await page.keyboard.insertText('Edited ')
  await page.clock.runFor(2500)
  expect(await readState(page)).toMatchObject({ index: 0, remaining: 700 })
  await expect(page.getByRole('textbox', { name: 'Caption 1', exact: true })).toHaveValue('Edited Read this slide')
  await page.locator('#outside-control').focus()
  await page.clock.runFor(700)
  expect((await readState(page)).index).toBe(1)
})

test('counter works without autoplay and counts source slides in a fractional vertical loop', async ({ page }) => {
  await mount(page, { autoplay: false, count: 3, options: { orientation: 'vertical', viewportHeight: 420, slidesPerView: 2.25 } })
  const counter = page.locator('.carousel__counter')
  await expect(counter).toHaveText('1 / 3')
  await expect(page.locator('.carousel__play-pause')).toBeHidden()
  await expect(page.locator('.carousel__autoplay-progress')).toBeHidden()
  await page.evaluate(() => window.controlsFixture.carousel.goTo(2))
  await expect(counter).toHaveText('3 / 3')
  await page.evaluate(() => window.controlsFixture.carousel.addSlide({ content: 'Fourth' }))
  await expect(counter).toHaveText('3 / 4')
  await page.evaluate(() => {
    const carousel = window.controlsFixture.carousel
    while (carousel.getSlides().length) carousel.removeSlide(0)
  })
  await expect(counter).toHaveText('0 / 0')
})

test('controls update visibility, placement, circular/bar presentation and inherited theme live', async ({ page }) => {
  await mount(page, { autoplay: false })
  await page.evaluate(async () => {
    const { createAutoplay } = await import('/src/index.js')
    const fixture = window.controlsFixture
    fixture.autoplay = createAutoplay({ interval: 1000, pauseOnHover: false, pauseOnFocus: false })
    fixture.carousel.use(fixture.autoplay)
    fixture.host.style.cssText += ';--carousel-play-size:52px;--carousel-play-color:rgb(12,34,56);--carousel-progress-size:44px;--carousel-progress-color:rgb(65,43,21);--carousel-progress-stroke:5;--carousel-counter-size:20px;--carousel-counter-color:rgb(98,76,54)'
  })
  await expect(page.getByRole('button', { name: 'Pause autoplay' })).toBeVisible()
  const styled = await page.evaluate(() => {
    const read = selector => getComputedStyle(document.querySelector(selector))
    return {
      buttonWidth: read('.carousel__play-pause').width,
      buttonColor: read('.carousel__play-pause').color,
      progressWidth: read('.carousel__autoplay-progress').width,
      progressColor: read('.carousel__autoplay-progress').color,
      stroke: read('.carousel__progress-ring').strokeWidth,
      counterSize: read('.carousel__counter').fontSize,
      counterColor: read('.carousel__counter').color,
    }
  })
  expect(styled).toEqual({ buttonWidth: '52px', buttonColor: 'rgb(12, 34, 56)', progressWidth: '44px', progressColor: 'rgb(65, 43, 21)', stroke: '5px', counterSize: '20px', counterColor: 'rgb(98, 76, 54)' })
  await page.evaluate(() => window.controlsFixture.controls.update({ playPause: false, progress: false, counter: false }))
  await expect(page.locator('.carousel__controls')).toBeHidden()
  await page.evaluate(() => window.controlsFixture.controls.update({ playPause: true, progress: 'bar', counter: true, position: 'overlay', labels: { play: 'Продолжить', pause: 'Пауза', counter: 'Слайд' } }))
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible()
  await expect(page.locator('.carousel__viewport > .carousel__controls')).toBeVisible()
  await expect(page.locator('.carousel__autoplay-progress--bar')).toBeVisible()
  await page.clock.runFor(250)
  const width = await page.evaluate(() => {
    const bar = document.querySelector('.carousel__autoplay-progress--bar')
    return bar.firstElementChild.getBoundingClientRect().width / bar.getBoundingClientRect().width
  })
  expect(width).toBeGreaterThan(0.22)
  expect(width).toBeLessThanOrEqual(0.25)
  await expect(page.locator('.carousel__counter')).toHaveAttribute('aria-label', 'Слайд 1 / 7')
})

test('autoplay progress excludes slide transition time and starts a new display interval on completion', async ({ page }) => {
  await mount(page, { autoplayFirst: true, autoplay: { pauseOnHover: false, pauseOnFocus: false, pauseOnInteraction: false }, options: { transitionDuration: 300 } })
  await page.clock.runFor(1000)
  expect(await readState(page)).toMatchObject({ active: true, paused: true, running: false, progress: 0, remaining: 1000 })
  await page.clock.runFor(200)
  expect((await readState(page)).running).toBe(false)
  await page.clock.runFor(200)
  const state = await readState(page)
  expect(state).toMatchObject({ index: 1, running: true, paused: false })
  expect(state.remaining).toBeGreaterThanOrEqual(900)
  expect(state.remaining).toBeLessThanOrEqual(1000)
  await expect(page.locator('.carousel__counter')).toHaveText('2 / 7')
})

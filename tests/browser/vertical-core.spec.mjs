import { test, expect } from '@playwright/test'

const fixture = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/styles/carousel.css">
<script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
<style>
  body { margin: 24px; }
  #gallery { width: 460px; --carousel-vertical-height: 420px; }
  article { box-sizing: border-box; width: 100%; height: 160px; padding: 8px; background: #c7d4ed; }
  .carousel--vertical article { height: 100%; }
  [data-control] { box-sizing: border-box; width: 100px; height: 32px; }
</style></head><body><button id="before">Before</button><div id="gallery"></div><button id="after">After</button></body></html>`

async function mount(page, options = {}, count = 7) {
  await page.route('**/__vertical_core__', route => route.fulfill({ contentType: 'text/html', body: fixture }))
  await page.goto('/__vertical_core__')
  await page.evaluate(async ({ options, count }) => {
    const { Carousel } = await import('/src/index.js')
    const inputs = []
    let context
    const carousel = new Carousel(document.querySelector('#gallery'), Array.from({ length: count }, (_, index) => ({
      content: () => {
        const article = document.createElement('article')
        const input = document.createElement('input')
        input.dataset.control = String(index)
        input.setAttribute('aria-label', `Slide ${index + 1}`)
        input.value = `Slide ${index + 1}`
        article.append(input)
        inputs.push(input)
        return article
      },
    })), {
      transitionDuration: 0,
      ...options,
      plugins: [{ name: 'vertical-probe', install(ctx) { context = ctx } }],
    })
    window.verticalFixture = { carousel, context, inputs, originalSlides: context.getSlideElements() }
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
  }, { options, count })
}

async function geometry(page) {
  return page.evaluate(() => {
    const { carousel, context } = window.verticalFixture
    const vertical = context.options.orientation === 'vertical'
    const viewport = context.getViewport().getBoundingClientRect()
    const axis = vertical ? 'top' : 'left'
    const dimension = vertical ? 'height' : 'width'
    const slots = context.getVisualElements().map(element => {
      const rect = element.getBoundingClientRect()
      return { index: Number(element.dataset.index), copy: element.hasAttribute('data-carousel-copy'),
        offset: rect[axis] - viewport[axis], size: rect[dimension], crossSize: rect[vertical ? 'width' : 'height'] }
    })
    return { index: carousel.getIndex(), step: context.getStep(), position: context.getPosition(),
      size: viewport[dimension], crossSize: viewport[vertical ? 'width' : 'height'], slots,
      orientation: context.options.orientation, marker: context.getRoot().classList.contains('carousel--vertical') }
  })
}

for (const orientation of ['horizontal', 'vertical']) {
  for (const slidesPerView of [1.15, 2.25]) {
    for (const loop of [false, true]) {
      test(`${orientation} ${slidesPerView} fills a ${loop ? 'short loop' : 'finite gallery'} through navigation`, async ({ page }) => {
        const count = loop ? Math.ceil(slidesPerView) : 7
        await mount(page, { orientation, viewportHeight: 420, slidesPerView, gap: 12, loop }, count)
        for (const destination of [0, count - 1, 0]) {
          await page.evaluate(index => window.verticalFixture.carousel.goTo(index), destination)
          const state = await geometry(page)
          const expectedSize = (state.size - 12 * (slidesPerView - 1)) / slidesPerView
          expect(Math.abs(state.slots[0].size - expectedSize)).toBeLessThan(0.1)
          expect(Math.abs(state.step - expectedSize - 12)).toBeLessThan(0.1)
          expect(state.marker).toBe(orientation === 'vertical')
          if (orientation === 'vertical') {
            expect(state.size).toBe(420)
            expect(Math.abs(state.slots[0].crossSize - state.crossSize)).toBeLessThan(0.1)
          }
          const visible = state.slots.filter(slot => slot.offset < state.size - 0.1 && slot.offset + slot.size > 0.1)
            .sort((a, b) => a.offset - b.offset)
          expect(visible[0].offset).toBeLessThan(0.1)
          expect(visible.at(-1).offset + visible.at(-1).size).toBeGreaterThan(state.size - 0.1)
          for (let i = 1; i < visible.length; i++) {
            expect(Math.abs(visible[i].offset - visible[i - 1].offset - state.step)).toBeLessThan(0.15)
          }
          if (!loop && destination === count - 1) {
            expect(Math.abs(visible.at(-1).offset + visible.at(-1).size - state.size)).toBeLessThan(0.15)
          }
        }
        if (loop) {
          await page.evaluate(() => {
            const { context } = window.verticalFixture
            context.setPositionDrag(context.getStep() * 0.63)
          })
          const state = await geometry(page)
          const overlap = slot => Math.max(0, Math.min(state.size, slot.offset + slot.size) - Math.max(0, slot.offset))
          for (const original of state.slots.filter(slot => !slot.copy)) {
            const peers = state.slots.filter(slot => slot.index === original.index)
            expect(overlap(original)).toBeGreaterThanOrEqual(Math.max(...peers.map(overlap)) - 0.1)
          }
        }
        await page.evaluate(() => window.verticalFixture.carousel.destroy())
      })
    }
  }
}

test('vertical height themes and responsive orientation retain selected content and native input state', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 })
  await mount(page, { slidesPerView: 1.15, breakpoints: { 1000: { orientation: 'vertical', slidesPerView: 2.25 } } })
  await page.evaluate(() => {
    const { carousel, inputs } = window.verticalFixture
    carousel.goTo(3)
    inputs[3].value = 'Preserved through breakpoint'
    inputs[3].focus({ preventScroll: true })
    inputs[3].setSelectionRange(5, 12)
  })
  await page.setViewportSize({ width: 1200, height: 800 })
  await expect.poll(async () => (await geometry(page)).orientation).toBe('vertical')
  expect((await geometry(page)).size).toBe(420)
  await page.evaluate(() => document.querySelector('#gallery').style.setProperty('--carousel-vertical-height', '540px'))
  await expect.poll(async () => (await geometry(page)).step).toBeCloseTo(540 / 2.25, 1)
  const retained = await page.evaluate(() => {
    const { carousel, context, inputs, originalSlides } = window.verticalFixture
    return { index: carousel.getIndex(), same: context.getSlideElements().every((slide, i) => slide === originalSlides[i]),
      value: inputs[3].value, focus: document.activeElement === inputs[3], selection: [inputs[3].selectionStart, inputs[3].selectionEnd] }
  })
  expect(retained).toEqual({ index: 3, same: true, value: 'Preserved through breakpoint', focus: true, selection: [5, 12] })
  await page.setViewportSize({ width: 800, height: 800 })
  await expect.poll(async () => (await geometry(page)).orientation).toBe('horizontal')
  const reset = await page.evaluate(() => {
    const { context } = window.verticalFixture
    return { height: context.getViewport().style.height, slideHeight: context.getSlideElement(0).style.height,
      minHeight: context.getSlideElement(0).style.minHeight, trackHeight: context.getTrack().style.height }
  })
  expect(reset).toEqual({ height: '', slideHeight: '', minHeight: '', trackHeight: '' })
})

test('native Tab keeps vertical controls visible without viewport scroll', async ({ page }) => {
  await mount(page, { orientation: 'vertical', viewportHeight: 420, slidesPerView: 1.15 })
  await page.locator('#before').focus()
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab')
    await expect(page.locator(`[data-control="${i}"]`)).toBeFocused()
    const focus = await page.evaluate(() => {
      const viewport = window.verticalFixture.context.getViewport()
      const bounds = viewport.getBoundingClientRect()
      const control = document.activeElement.getBoundingClientRect()
      return { scrollTop: viewport.scrollTop, scrollLeft: viewport.scrollLeft,
        visible: control.top >= bounds.top - 0.5 && control.bottom <= bounds.bottom + 0.5 }
    })
    expect(focus).toEqual({ scrollTop: 0, scrollLeft: 0, visible: true })
  }
  await page.keyboard.press('Tab')
  await expect(page.locator('#after')).toBeFocused()
})

test('vertical width-only resize retires a custom cover and settles its destination once', async ({ page }) => {
  await mount(page, { orientation: 'vertical', viewportHeight: 420, loop: true, slidesPerView: 2.25 })
  await page.evaluate(() => {
    const { carousel } = window.verticalFixture
    const stats = { created: 0, destroyed: 0, ended: 0 }
    window.verticalFixture.stats = stats
    carousel.update({ transitionDuration: 10000, transition: {
      name: 'resize-cover', create({ container }) {
        stats.created++
        const piece = document.createElement('div')
        Object.assign(piece.style, { position: 'absolute', inset: '0', background: '#345' })
        container.append(piece)
        return { render() {}, destroy() { stats.destroyed++ } }
      },
    } })
    carousel.on('transition:end', () => stats.ended++)
    carousel.goTo(4)
    document.querySelector('#gallery').style.width = '350px'
  })
  await expect.poll(() => page.locator('.carousel__transition').count()).toBe(0)
  const state = await page.evaluate(() => ({ ...window.verticalFixture.stats, index: window.verticalFixture.carousel.getIndex() }))
  expect(state).toEqual({ created: 1, destroyed: 1, ended: 1, index: 4 })
  expect((await geometry(page)).size).toBe(420)
})

test('vertical fade retains width and height when finishing and when switching orientation', async ({ page }) => {
  await mount(page, { orientation: 'vertical', viewportHeight: 420, transition: 'fade', transitionDuration: 80 })
  await page.evaluate(() => window.verticalFixture.carousel.next())
  await expect.poll(() => page.evaluate(() => window.verticalFixture.context.getSlideElement(1).style.opacity)).toBe('')
  let state = await geometry(page)
  expect(state.index).toBe(1)
  expect(state.size).toBe(420)
  expect(state.slots[1].size).toBe(420)
  expect(Math.abs(state.slots[1].offset)).toBeLessThan(0.1)
  await page.evaluate(() => {
    window.verticalFixture.carousel.next()
    window.verticalFixture.carousel.update({ orientation: 'horizontal' })
  })
  state = await geometry(page)
  expect(state.orientation).toBe('horizontal')
  expect(state.slots[0].size).toBe(460)
  await expect(page.locator('.carousel__slide').first()).toHaveCSS('position', 'static')
})

test('all viewport cover presets settle vertical fractional galleries and remove decorative layers', async ({ page }) => {
  await mount(page, { orientation: 'vertical', viewportHeight: 420, loop: true, slidesPerView: 2.25, gap: 12 })
  const presets = ['stairs', 'stairs-horizontal', 'pixel', 'curtain', 'diamond-wipe', 'directional-wipe',
    'clock-wipe', 'aperture-wipe', 'polka-dots', 'grid-flip', 'doorway', 'water-drop']
  for (const transition of presets) {
    const destination = await page.evaluate(transition => {
      const { carousel } = window.verticalFixture
      carousel.update({ transition, transitionDuration: 100 })
      const destination = (carousel.getIndex() + 1) % 7
      carousel.next()
      return destination
    }, transition)
    await expect.poll(() => page.locator('.carousel__transition').count()).toBe(0)
    const state = await geometry(page)
    expect(state.index, transition).toBe(destination)
    const selected = state.slots.find(slot => !slot.copy && slot.index === destination)
    expect(Math.abs(selected.offset), transition).toBeLessThan(0.15)
    expect(Math.abs(selected.size - (420 - 12 * 1.25) / 2.25), transition).toBeLessThan(0.15)
  }
})

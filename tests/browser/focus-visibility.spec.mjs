import { test, expect } from '@playwright/test'

const fixture = `<!doctype html><html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/styles/carousel.css">
  <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
  <style>
    body { margin: 32px; }
    #gallery { width: 360px; margin: 16px 0; }
    #gallery article { height: 120px; padding: 8px; box-sizing: border-box; }
    [data-slide-control] { box-sizing: border-box; width: 56px; height: 32px; padding: 2px; }
  </style>
  </head><body><button id="before">Before gallery</button><div id="gallery"></div><button id="after">After gallery</button></body></html>`

async function snapshot(page) {
  return page.evaluate(() => {
    const { carousel, context } = window.focusFixture
    const viewport = context.getViewport()
    const viewportRect = viewport.getBoundingClientRect()
    const focused = document.activeElement
    const focusedRect = focused.getBoundingClientRect()
    const focusedSlide = focused.closest('.carousel__slide')
    const index = carousel.getIndex()
    const selectedRect = context.getSlideElement(index).getBoundingClientRect()
    const centerX = (focusedRect.left + focusedRect.right) / 2
    const centerY = (focusedRect.top + focusedRect.bottom) / 2
    const hit = document.elementFromPoint(centerX, centerY)
    return {
      activeId: focused.id,
      inSlide: !!focusedSlide,
      focusedSlide: focusedSlide ? Number(focusedSlide.dataset.index) : null,
      focusedCopy: focusedSlide?.hasAttribute('data-carousel-copy') ?? false,
      focusVisible: centerX >= viewportRect.left && centerX <= viewportRect.right
        && centerY >= viewportRect.top && centerY <= viewportRect.bottom
        && (hit === focused || focused.contains(hit)),
      index,
      position: context.getPosition(),
      scrollLeft: viewport.scrollLeft,
      selectedOffset: selectedRect.left - viewportRect.left,
      focusedOffset: focusedRect.left - viewportRect.left,
      viewportWidth: viewportRect.width,
    }
  })
}

for (const model of [
  { name: 'finite single-slide', loop: false, slidesPerView: 1, startIndex: 0 },
  { name: 'fractional loop after wrap', loop: true, slidesPerView: 2.5, startIndex: 4 },
]) {
  test(`Tab keeps focused slide content visible and position coherent in a ${model.name} layout`, async ({ page }, testInfo) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__focus_visibility__', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('/__focus_visibility__')
    await page.evaluate(async model => {
      const { Carousel, createKeyboard } = await import('/src/index.js')
      const host = document.querySelector('#gallery')
      let context
      const carousel = new Carousel(host, Array.from({ length: 6 }, (_, index) => ({
        content: () => {
          const article = document.createElement('article')
          const control = document.createElement(index % 2 ? 'input' : 'button')
          control.id = `control-${index}`
          control.dataset.slideControl = String(index)
          control.setAttribute('aria-label', `Edit slide ${index + 1}`)
          if (control.tagName === 'INPUT') control.value = String(index + 1)
          else { control.type = 'button'; control.textContent = `Edit ${index + 1}` }
          article.append(control)
          return article
        },
      })), {
        loop: model.loop,
        slidesPerView: model.slidesPerView,
        startIndex: model.startIndex,
        transitionDuration: 0,
        plugins: [createKeyboard(), { name: 'focus-probe', install(ctx) { context = ctx } }],
      })
      window.focusFixture = { carousel, context }
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
    }, model)

    const samples = []
    try {
      // Use real sequential keyboard focus. locator.focus()/click() could scroll
      // the target into view themselves and hide the native Tab regression.
      await page.keyboard.press('Tab')
      await expect(page.locator('#before')).toBeFocused()
      for (const [key, sentinel] of [['Tab', 'after'], ['Shift+Tab', 'before']]) {
        let reachedSentinel = false
        for (let step = 0; step < 12; step++) {
          await page.keyboard.press(key)
          const state = await snapshot(page)
          samples.push({ key, ...state })
          if (state.activeId === sentinel) { reachedSentinel = true; break }
        }
        expect(reachedSentinel, `${key} must be able to leave the carousel`).toBe(true)
      }

      const focusedSlides = samples.filter(state => state.inSlide)
      expect(focusedSlides.length).toBeGreaterThan(0)
      for (const state of focusedSlides) {
        const diagnostic = JSON.stringify(state)
        expect.soft(state.focusedCopy, diagnostic).toBe(false)
        expect.soft(state.focusVisible, diagnostic).toBe(true)
        expect.soft(Math.abs(state.scrollLeft), diagnostic).toBeLessThan(0.5)
        expect.soft(Math.abs(state.selectedOffset), diagnostic).toBeLessThan(0.5)
      }
      expect(errors).toEqual([])
    } finally {
      // Keep the actual native focus/scroll trace with a failed CI run so the
      // candidate can be confirmed or rejected from evidence, not a DOM mock.
      await testInfo.attach('focus-trace', {
        body: Buffer.from(JSON.stringify({ model, samples, errors }, null, 2)),
        contentType: 'application/json',
      })
      await page.evaluate(() => window.focusFixture?.carousel.destroy())
    }
  })
}

async function openInteractiveFixture(page, { shadow = false, custom = false } = {}) {
  await page.route('**/__focus_visibility__', route => route.fulfill({ contentType: 'text/html', body: fixture }))
  await page.goto('/__focus_visibility__')
  await page.evaluate(async ({ shadow, custom }) => {
    const { Carousel, createKeyboard } = await import('/src/index.js')
    const state = { created: 0, cleaned: 0, events: [], controls: [], inputEvents: 0 }
    const transition = { name: 'focus-animation', create({ container }) {
      state.created++
      const panel = document.createElement('div')
      Object.assign(panel.style, { position: 'absolute', inset: '0', background: '#123' })
      container.append(panel)
      return {
        render(progress) { panel.style.opacity = String(1 - Math.abs(2 * progress - 1)) },
        destroy() { state.cleaned++ },
      }
    } }
    let context
    const carousel = new Carousel(document.querySelector('#gallery'), Array.from({ length: 4 }, (_, index) => ({
      content: () => {
        const article = document.createElement('article')
        const root = shadow ? article.attachShadow({ mode: 'open' }) : article
        const input = document.createElement('input')
        input.setAttribute('aria-label', `Edit slide ${index + 1}`)
        input.value = `Value ${index + 1}`
        input.addEventListener('input', () => state.inputEvents++)
        Object.assign(input.style, { boxSizing: 'border-box', width: '96px', height: '32px' })
        root.append(input)
        state.controls.push(input)
        return article
      },
    })), {
      loop: true,
      transition: custom ? transition : 'slide',
      transitionDuration: 10000,
      plugins: [createKeyboard(), { name: 'focus-probe', install(ctx) { context = ctx } }],
    })
    carousel.on('transition:end', ({ index }) => state.events.push(`end:${index}`))
    carousel.on('slide:change', ({ index }) => state.events.push(`change:${index}`))
    window.focusFixture = { carousel, context, state }
  }, { shadow, custom })
  await page.keyboard.press('Tab')
  await expect(page.locator('#before')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.carousel')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('textbox', { name: 'Edit slide 1', exact: true })).toBeFocused()
}

test('Tab reveals the actual Shadow DOM editor without replacing its value or listeners', async ({ page }) => {
  await openInteractiveFixture(page, { shadow: true })
  try {
    await page.keyboard.press('Tab')
    const editor = page.getByRole('textbox', { name: 'Edit slide 2', exact: true })
    await expect(editor).toBeFocused()
    await page.keyboard.press('End')
    await page.keyboard.type('X')
    await expect(editor).toHaveValue('Value 2X')
    const result = await page.evaluate(() => {
      const { carousel, context, state } = window.focusFixture
      const slide = context.getSlideElement(1)
      const editor = slide.querySelector('article').shadowRoot.activeElement
      return {
        index: carousel.getIndex(),
        scrollLeft: context.getViewport().scrollLeft,
        retained: editor === state.controls[1],
        inputEvents: state.inputEvents,
        events: state.events,
      }
    })
    expect(result).toEqual({ index: 1, scrollLeft: 0, retained: true, inputEvents: 1, events: ['end:1', 'change:1'] })
  } finally {
    await page.evaluate(() => window.focusFixture.carousel.destroy())
  }
})

test('Tab cancels an active loop effect and keeps subsequent configured transitions animated', async ({ page }) => {
  await openInteractiveFixture(page, { custom: true })
  try {
    await page.evaluate(() => window.focusFixture.carousel.goTo(1))
    await expect(page.locator('.carousel__transition')).toHaveCount(1)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('textbox', { name: 'Edit slide 2', exact: true })).toBeFocused()
    await expect(page.locator('.carousel__transition')).toHaveCount(0)
    const result = await page.evaluate(() => {
      const { carousel, context, state } = window.focusFixture
      return {
        index: carousel.getIndex(), scrollLeft: context.getViewport().scrollLeft,
        created: state.created, cleaned: state.cleaned, events: state.events,
        duration: context.options.transitionDuration,
      }
    })
    expect(result).toEqual({
      index: 1, scrollLeft: 0, created: 1, cleaned: 1,
      events: ['end:1', 'change:1'], duration: 10000,
    })
    await page.evaluate(() => window.focusFixture.carousel.goTo(2))
    await expect(page.locator('.carousel__transition')).toHaveCount(1)
    expect(await page.evaluate(() => window.focusFixture.state.created)).toBe(2)
  } finally {
    await page.evaluate(() => window.focusFixture.carousel.destroy())
  }
})

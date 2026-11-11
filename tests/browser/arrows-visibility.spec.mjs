import { test, expect } from '@playwright/test'

const pageErrors = new WeakMap()

test.beforeEach(async ({ page }) => {
  const errors = []
  pageErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    for (const fixture of Object.values(window.arrowFixtures ?? {})) fixture.carousel.destroy()
  })
  expect(pageErrors.get(page)).toEqual([])
})

async function openFixture(page, theme = '') {
  await page.route('**/__arrows_visibility__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body{margin:64px;font-family:sans-serif}
        .arrows-host{max-width:600px;padding:24px;margin:16px 0;box-sizing:border-box;background:#e9eef4}
        .arrows-host article{height:128px;background:#123;color:white}
        @media(max-width:600px){body{margin:24px}}
        ${theme}
      </style>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
      </head><body><button id="before">Before gallery</button><div id="fixtures"></div><button id="after">After gallery</button></body></html>`,
  }))
  await page.goto('/__arrows_visibility__')
  await page.mouse.move(4, 4)
}

async function mount(page, model = {}) {
  await page.evaluate(async model => {
    const { Carousel, createArrows, createDots, createKeyboard } = await import('/src/index.js')
    const host = document.createElement('section')
    host.id = model.id ?? 'gallery'
    host.className = 'arrows-host'
    document.querySelector('#fixtures').append(host)
    const slides = Array.from({ length: model.count ?? 4 }, (_, index) => ({ content: `<article>Slide ${index + 1}</article>` }))
    const arrows = createArrows(model.arrows ?? {})
    let context
    let carousel
    const create = () => new Carousel(host, slides, {
      loop: true,
      transitionDuration: 0,
      ...model.options,
      plugins: [
        arrows,
        createDots(),
        ...(model.keyboard ? [createKeyboard()] : []),
        { name: 'arrows-probe', install(ctx) { context = ctx } },
      ],
    })
    carousel = create()
    window.arrowFixtures ??= {}
    window.arrowFixtures[host.id] = {
      host,
      get carousel() { return carousel },
      get context() { return context },
      remount() { carousel.destroy(); carousel = create() },
    }
  }, model)
}

function controls(page, id = 'gallery') {
  const host = page.locator(`#${id}`)
  return {
    host,
    root: host.locator('.carousel'),
    viewport: host.locator('.carousel__viewport'),
    prev: host.getByRole('button', { name: 'Previous slide', exact: true }),
    next: host.getByRole('button', { name: 'Next slide', exact: true }),
    dots: host.getByRole('navigation', { name: 'Carousel pagination' }),
  }
}

async function state(page, id = 'gallery') {
  return page.evaluate(id => {
    const viewport = window.arrowFixtures[id].context.getViewport()
    const rect = element => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect()
      return { left, top, right, bottom, width, height }
    }
    return {
      viewport: rect(viewport),
      scrollLeft: viewport.scrollLeft,
      arrows: Object.fromEntries(['prev', 'next'].map(direction => {
        const button = viewport.querySelector(`.carousel__arrow--${direction}`)
        const bounds = rect(button)
        const style = getComputedStyle(button)
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
        return [direction, {
          ...bounds,
          opacity: Number(style.opacity),
          pointerEvents: style.pointerEvents,
          display: style.display,
          hit: button.contains(hit),
        }]
      })),
    }
  }, id)
}

async function expectWithdrawn(page, id = 'gallery') {
  await expect.poll(async () => {
    const { arrows } = await state(page, id)
    return Object.values(arrows).map(({ opacity, pointerEvents }) => ({ opacity, pointerEvents }))
  }).toEqual([{ opacity: 0, pointerEvents: 'none' }, { opacity: 0, pointerEvents: 'none' }])
  const result = await state(page, id)
  expect(result.arrows.prev.right).toBeLessThanOrEqual(result.viewport.left + 0.5)
  expect(result.arrows.next.left).toBeGreaterThanOrEqual(result.viewport.right - 0.5)
  expect(result.arrows.prev.hit).toBe(false)
  expect(result.arrows.next.hit).toBe(false)
  return result
}

async function expectRevealed(page, id = 'gallery') {
  await expect.poll(async () => {
    const { arrows } = await state(page, id)
    return Object.values(arrows).map(({ opacity, pointerEvents }) => ({ opacity, pointerEvents }))
  }).toEqual([{ opacity: 1, pointerEvents: 'auto' }, { opacity: 1, pointerEvents: 'auto' }])
  const result = await state(page, id)
  expect(result.arrows.prev.left).toBeGreaterThanOrEqual(result.viewport.left)
  expect(result.arrows.next.right).toBeLessThanOrEqual(result.viewport.right)
  expect(result.arrows.prev.hit).toBe(true)
  expect(result.arrows.next.hit).toBe(true)
  return result
}

async function expectIndex(page, index, id = 'gallery') {
  await expect.poll(() => page.evaluate(id => window.arrowFixtures[id].carousel.getIndex(), id)).toBe(index)
}

test('idle hiding is opt-in and does not affect neighbouring default arrows', async ({ page }) => {
  await openFixture(page)
  await mount(page, { id: 'always' })
  await mount(page, { id: 'idle', arrows: { hideOnIdle: true } })
  await expectRevealed(page, 'always')
  await expectWithdrawn(page, 'idle')
  await controls(page, 'always').next.click()
  await expectIndex(page, 1, 'always')
  await page.mouse.move(4, 4)
  await expectRevealed(page, 'always')
  await expectWithdrawn(page, 'idle')
})

test('arrows retreat past opposite clipped edges and only hovering the slide reveals them', async ({ page }) => {
  await openFixture(page)
  await mount(page, { arrows: { hideOnIdle: true } })
  const gallery = controls(page)
  await expectWithdrawn(page)
  // Remove the pointer/opacity guards temporarily: native overflow clipping must
  // still prevent either off-slide button from receiving a hit outside the viewport.
  const clipped = await gallery.viewport.evaluate(viewport => [...viewport.querySelectorAll('.carousel__arrow')].map(button => {
    const original = button.getAttribute('style')
    button.style.transition = 'none'
    button.style.opacity = '1'
    button.style.pointerEvents = 'auto'
    const rect = button.getBoundingClientRect()
    const hit = button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
    if (original === null) button.removeAttribute('style')
    else button.setAttribute('style', original)
    return hit
  }))
  expect(clipped).toEqual([false, false])
  await gallery.host.hover({ position: { x: 8, y: 8 } })
  await expectWithdrawn(page)
  await gallery.dots.hover()
  await expectWithdrawn(page)
  await gallery.viewport.hover()
  const shown = await expectRevealed(page)
  expect(shown.arrows.prev.left - shown.viewport.left).toBeCloseTo(12, 1)
  expect(shown.viewport.right - shown.arrows.next.right).toBeCloseTo(12, 1)
  await page.mouse.move(4, 4)
  await expectWithdrawn(page)
})

test('mouse navigation does not pin arrows open after the pointer leaves', async ({ page }) => {
  await openFixture(page)
  await mount(page, { arrows: { hideOnIdle: true } })
  const gallery = controls(page)
  for (const [direction, index] of [['next', 1], ['prev', 0]]) {
    await gallery.viewport.hover()
    await expectRevealed(page)
    await gallery[direction].click()
    await expectIndex(page, index)
    await page.mouse.move(4, 4)
    await expect(gallery[direction]).toBeFocused()
    expect(await gallery[direction].evaluate(button => button.matches(':focus-visible'))).toBe(false)
    await expectWithdrawn(page)
  }
})

for (const keyboard of [false, true]) {
  test(`Tab reveals arrows without scrolling the viewport (${keyboard ? 'keyboard plugin' : 'buttons only'})`, async ({ page }) => {
    await openFixture(page)
    await mount(page, { arrows: { hideOnIdle: true }, keyboard })
    const gallery = controls(page)
    await page.keyboard.press('Tab')
    await expect(page.locator('#before')).toBeFocused()
    await expectWithdrawn(page)
    await page.keyboard.press('Tab')
    if (keyboard) {
      await expect(gallery.root).toBeFocused()
      await expectRevealed(page)
      await page.keyboard.press('Tab')
    }
    await expect(gallery.prev).toBeFocused()
    await expectRevealed(page)
    await page.keyboard.press('Tab')
    await expect(gallery.next).toBeFocused()
    await page.keyboard.press('Enter')
    await expectIndex(page, 1)
    await page.mouse.move(4, 4)
    expect((await expectRevealed(page)).scrollLeft).toBe(0)
    // Pagination is outside the slide: its keyboard focus must not reveal arrows.
    await page.keyboard.press('Tab')
    await expect(gallery.dots.getByRole('button').first()).toBeFocused()
    expect((await expectWithdrawn(page)).scrollLeft).toBe(0)
    await page.keyboard.press('Shift+Tab')
    await expect(gallery.next).toBeFocused()
    await page.keyboard.press('Enter')
    await expectIndex(page, 2)
    expect((await expectRevealed(page)).scrollLeft).toBe(0)
  })
}

test.describe('touch input', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('touch users can always see and tap opted-in arrows without hover', async ({ page }) => {
    await openFixture(page)
    await mount(page, { arrows: { hideOnIdle: true } })
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true)
    const gallery = controls(page)
    await expectRevealed(page)
    await gallery.next.tap()
    await expectIndex(page, 1)
    await gallery.prev.tap()
    await expectIndex(page, 0)
    await page.locator('#before').tap()
    await expectRevealed(page)
  })
})

test('edge hiding, empty/single slides and short loops retain their navigation rules', async ({ page }) => {
  await openFixture(page, '.arrows-host{--carousel-control-duration:0ms}')
  for (const [id, count] of [['empty', 0], ['single', 1]]) {
    await mount(page, { id, count, arrows: { hideOnIdle: true, hideOnEdge: false } })
    await controls(page, id).host.hover({ position: { x: 8, y: 8 } })
    await expect(page.locator(`#${id} .carousel__arrow--prev`)).toHaveCSS('display', 'none')
    await expect(page.locator(`#${id} .carousel__arrow--next`)).toHaveCSS('display', 'none')
  }
  await mount(page, { id: 'finite', count: 5, arrows: { hideOnIdle: true }, options: { loop: false, slidesPerView: 2.5 } })
  const finite = controls(page, 'finite')
  await finite.viewport.hover()
  await expect(page.locator('#finite .carousel__arrow--prev')).toHaveCSS('display', 'none')
  for (const index of [1, 2, 3]) {
    await finite.next.click()
    await expectIndex(page, index, 'finite')
  }
  await expect(page.locator('#finite .carousel__arrow--next')).toHaveCSS('display', 'none')
  await finite.prev.click()
  await expectIndex(page, 2, 'finite')
  await expectRevealed(page, 'finite')
  await mount(page, { id: 'loop', count: 2, arrows: { hideOnIdle: true }, options: { slidesPerView: 2.5 } })
  const loop = controls(page, 'loop')
  await loop.viewport.hover()
  await expectRevealed(page, 'loop')
  await loop.prev.click()
  await expectIndex(page, 1, 'loop')
  await loop.next.click()
  await expectIndex(page, 0, 'loop')
  await expectRevealed(page, 'loop')
  await mount(page, { id: 'free', count: 2, arrows: { hideOnIdle: true, hideOnEdge: false }, options: { loop: false } })
  const free = controls(page, 'free')
  await free.viewport.hover()
  await expectRevealed(page, 'free')
  await free.next.click()
  await expectIndex(page, 1, 'free')
  await expectRevealed(page, 'free')
})

test('inherited and changing arrow sizes/offsets fully retreat without leaking between instances', async ({ page }) => {
  await openFixture(page, `
    .arrows-host{--carousel-control-duration:0ms}
    #large{--carousel-arrow-size:72px;--carousel-arrow-offset:28px;--carousel-arrow-border:3px solid #456}
    #small{--carousel-arrow-size:28px;--carousel-arrow-offset:5px}
  `)
  await mount(page, { id: 'large', arrows: { hideOnIdle: true } })
  await mount(page, { id: 'small', arrows: { hideOnIdle: true } })
  await expectWithdrawn(page, 'large')
  await expectWithdrawn(page, 'small')
  for (const [size, offset] of [[72, 28], [96, 36]]) {
    await page.evaluate(({ size, offset }) => {
      const { host } = window.arrowFixtures.large
      host.style.setProperty('--carousel-arrow-size', `${size}px`)
      host.style.setProperty('--carousel-arrow-offset', `${offset}px`)
    }, { size, offset })
    await expectWithdrawn(page, 'large')
    await controls(page, 'large').viewport.hover()
    const shown = await expectRevealed(page, 'large')
    for (const arrow of Object.values(shown.arrows)) {
      expect(arrow.width).toBe(size)
      expect(arrow.height).toBe(size)
      expect(arrow.top + size / 2).toBeCloseTo(shown.viewport.top + shown.viewport.height / 2, 1)
    }
    expect(shown.arrows.prev.left - shown.viewport.left).toBeCloseTo(offset, 1)
    expect(shown.viewport.right - shown.arrows.next.right).toBeCloseTo(offset, 1)
    await page.mouse.move(4, 4)
    await expectWithdrawn(page, 'large')
  }
  await controls(page, 'small').viewport.hover()
  const small = await expectRevealed(page, 'small')
  expect(small.arrows.prev.width).toBe(28)
  expect(small.arrows.prev.left - small.viewport.left).toBeCloseTo(5, 1)
  await expectWithdrawn(page, 'large')
})

test('updates, breakpoint rebuilds and reuse after destruction keep one working pair of arrows', async ({ page }) => {
  await openFixture(page, '.arrows-host{--carousel-control-duration:0ms}')
  await mount(page, { arrows: { hideOnIdle: true } })
  await page.evaluate(() => {
    const { carousel } = window.arrowFixtures.gallery
    carousel.update({ gap: 12, breakpoints: { 600: { slidesPerView: 2 } } })
    carousel.addSlide({ content: '<article>Added slide</article>' })
  })
  await expect.poll(() => page.evaluate(() => window.arrowFixtures.gallery.context.getSlidesPerView())).toBe(2)
  await expect(page.locator('#gallery .carousel__arrow')).toHaveCount(2)
  await expectWithdrawn(page)
  await page.setViewportSize({ width: 480, height: 800 })
  await expect.poll(() => page.evaluate(() => window.arrowFixtures.gallery.context.getSlidesPerView())).toBe(1)
  await controls(page).viewport.hover()
  await expectRevealed(page)
  await controls(page).next.click()
  await expectIndex(page, 1)
  const retired = await page.evaluate(() => {
    const fixture = window.arrowFixtures.gallery
    const viewport = fixture.context.getViewport()
    fixture.carousel.destroy()
    const result = {
      children: fixture.host.childElementCount,
      arrows: viewport.querySelectorAll('.carousel__arrow').length,
      marker: viewport.classList.contains('carousel__viewport--arrows-on-hover'),
    }
    fixture.remount()
    return result
  })
  expect(retired).toEqual({ children: 0, arrows: 0, marker: false })
  await page.mouse.move(4, 4)
  await expect(page.locator('#gallery .carousel__arrow')).toHaveCount(2)
  await expectWithdrawn(page)
  await controls(page).viewport.hover()
  await expectRevealed(page)
  await controls(page).next.click()
  await expectIndex(page, 1)
})

test('reduced motion makes both hiding and revealing immediate despite a long themed duration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFixture(page, '.arrows-host{--carousel-control-duration:5s}')
  await mount(page, { arrows: { hideOnIdle: true } })
  const gallery = controls(page)
  await expectWithdrawn(page)
  await gallery.viewport.hover()
  const shown = await state(page)
  expect(Object.values(shown.arrows).map(arrow => arrow.opacity)).toEqual([1, 1])
  await expectRevealed(page)
  await page.mouse.move(4, 4)
  const hidden = await state(page)
  expect(Object.values(hidden.arrows).map(arrow => arrow.opacity)).toEqual([0, 0])
  await expectWithdrawn(page)
  const motion = await gallery.viewport.evaluate(viewport => [...viewport.querySelectorAll('.carousel__arrow')].map(button => ({
    duration: getComputedStyle(button).transitionDuration,
    running: button.getAnimations().some(animation => animation.playState === 'running'),
  })))
  expect(motion).toEqual([{ duration: '0s', running: false }, { duration: '0s', running: false }])
})

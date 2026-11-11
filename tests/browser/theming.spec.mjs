import { test, expect } from '@playwright/test'

const pageErrors = new WeakMap()

test.beforeEach(async ({ page }) => {
  const errors = []
  pageErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    for (const fixture of Object.values(window.themingFixtures ?? {})) fixture.carousel.destroy()
  })
  expect(pageErrors.get(page)).toEqual([])
})

async function openFixture(page, theme = '') {
  await page.route('**/__theming__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <style>body{margin:16px}.theming-host{width:100%;max-width:600px;margin-bottom:24px}${theme}</style>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
      </head><body></body></html>`,
  }))
  await page.goto('/__theming__')
}

async function mount(page, model = {}) {
  await page.evaluate(async model => {
    const { Carousel, createArrows, createDots, createThumbnails, createKeyboard, createLazyLoad } = await import('/src/index.js')
    const host = document.createElement('section')
    host.id = model.id ?? 'gallery'
    host.className = 'theming-host'
    if (model.theme) host.dataset.theme = model.theme
    document.body.append(host)
    const contents = Array.from({ length: model.count ?? 4 }, (_, index) => {
      const article = document.createElement('article')
      article.className = 'application-content'
      article.style.cssText = 'height:120px;background:rgb(17,34,51);color:rgb(220,221,222);font-size:19px;border-radius:7px'
      article.textContent = `Slide ${index + 1}`
      return article
    })
    const slides = contents.map(content => ({ content: () => content, lazy: model.lazy ?? false }))
    let context
    let carousel
    const create = () => new Carousel(host, slides, {
      transitionDuration: 0,
      ...model.options,
      plugins: [
        createArrows(model.customArrows ? {
          prevHTML: '<svg width="17" height="19" viewBox="0 0 17 19" aria-hidden="true"><path d="M12 2L4 9.5L12 17" /></svg>',
          nextHTML: '<svg width="17" height="19" viewBox="0 0 17 19" aria-hidden="true"><path d="M4 2L12 9.5L4 17" /></svg>',
        } : {}),
        createDots(),
        createThumbnails(model.thumbnails ?? {}),
        ...(model.keyboard ? [createKeyboard()] : []),
        ...(model.lazy ? [createLazyLoad({ preload: 0 })] : []),
        { name: 'theme-probe', install(ctx) { context = ctx } },
      ],
    })
    carousel = create()
    window.themingFixtures ??= {}
    window.themingFixtures[host.id] = {
      host, contents,
      get carousel() { return carousel },
      get context() { return context },
      remount() { carousel.destroy(); carousel = create() },
    }
  }, model)
}

async function appearance(page, id = 'gallery') {
  return page.evaluate(id => {
    const host = window.themingFixtures[id].host
    const arrow = getComputedStyle(host.querySelector('.carousel__arrow--next'))
    const icon = getComputedStyle(host.querySelector('.carousel__arrow--next svg'))
    const dot = getComputedStyle(host.querySelector('.carousel__dot'))
    const thumb = getComputedStyle(host.querySelector('.carousel__thumb'))
    const content = getComputedStyle(host.querySelector('.application-content'))
    return {
      arrow: { width: arrow.width, height: arrow.height, background: arrow.backgroundColor, color: arrow.color, borderWidth: arrow.borderTopWidth },
      icon: { width: icon.width, height: icon.height },
      dot: { width: dot.width, height: dot.height },
      thumb: { width: thumb.width, height: thumb.height, borderWidth: thumb.borderTopWidth, boxSizing: thumb.boxSizing },
      radius: getComputedStyle(host.querySelector('.carousel__viewport')).borderRadius,
      content: { background: content.backgroundColor, color: content.color, fontSize: content.fontSize, borderRadius: content.borderRadius },
    }
  }, id)
}

test('unthemed controls retain their default appearance and leave application content alone', async ({ page }) => {
  await openFixture(page)
  await mount(page)
  expect(await appearance(page)).toEqual({
    arrow: { width: '40px', height: '40px', background: 'rgba(255, 255, 255, 0.9)', color: 'rgb(51, 51, 51)', borderWidth: '0px' },
    icon: { width: '24px', height: '24px' },
    dot: { width: '10px', height: '10px' },
    thumb: { width: '60px', height: '40px', borderWidth: '2px', boxSizing: 'border-box' },
    radius: '0px',
    content: { background: 'rgb(17, 34, 51)', color: 'rgb(220, 221, 222)', fontSize: '19px', borderRadius: '7px' },
  })
})

test('tokens declared before the library inherit from root and host, with explicit root overrides preserved', async ({ page }) => {
  await openFixture(page, `
    :root{--carousel-arrow-size:48px;--carousel-dot-size:14px;--carousel-thumb-width:82px;--carousel-thumb-height:54px;--carousel-transition-color:rgb(21,43,65)}
    #inherited{--carousel-arrow-bg:rgb(45,67,89);--carousel-arrow-border:3px solid rgb(1,2,3)}
    #local{--carousel-arrow-size:56px;--carousel-dot-width:28px;--carousel-dot-height:8px;--carousel-radius:18px}
    #legacy .carousel{--carousel-arrow-size:52px}
  `)
  await mount(page, { id: 'inherited', thumbnails: { width: 70, height: 50 }, options: { transition: 'curtain', transitionDuration: 400 } })
  await mount(page, { id: 'local' })
  await mount(page, { id: 'legacy' })
  const inherited = await appearance(page, 'inherited')
  expect(inherited.arrow).toMatchObject({ width: '48px', height: '48px', background: 'rgb(45, 67, 89)', borderWidth: '3px' })
  expect(inherited.dot).toEqual({ width: '14px', height: '14px' })
  expect(inherited.thumb).toMatchObject({ width: '82px', height: '54px' })
  const local = await appearance(page, 'local')
  expect(local.arrow.width).toBe('56px')
  expect(local.dot).toEqual({ width: '28px', height: '8px' })
  expect(local.radius).toBe('18px')
  expect((await appearance(page, 'legacy')).arrow.width).toBe('52px')
  const panelColor = await page.evaluate(() => {
    const { carousel, host } = window.themingFixtures.inherited
    carousel.next()
    const color = getComputedStyle(host.querySelector('.carousel__transition-piece')).backgroundColor
    carousel.update({ transitionDuration: 0 })
    return color
  })
  expect(panelColor).toBe('rgb(21, 43, 65)')
})

test('light and dark instances switch themes live without remounting or affecting their neighbour', async ({ page }) => {
  await openFixture(page, `
    [data-theme=light]{--carousel-arrow-size:44px;--carousel-arrow-bg:rgb(245,246,247);--carousel-arrow-color:rgb(20,21,22);--carousel-radius:8px;--carousel-control-duration:0ms}
    [data-theme=dark]{--carousel-arrow-size:52px;--carousel-arrow-bg:rgb(30,31,32);--carousel-arrow-color:rgb(240,241,242);--carousel-radius:16px;--carousel-control-duration:0ms}
  `)
  await mount(page, { id: 'first', theme: 'light' })
  await mount(page, { id: 'second', theme: 'dark' })
  const light = await appearance(page, 'first')
  const dark = await appearance(page, 'second')
  expect(light.arrow.background).toBe('rgb(245, 246, 247)')
  expect(dark.arrow.background).toBe('rgb(30, 31, 32)')
  const identities = await page.evaluate(() => {
    const first = window.themingFixtures.first
    const second = window.themingFixtures.second
    first.carousel.goTo(1)
    const root = first.context.getRoot()
    const content = first.context.getSlideElement(1).firstChild
    first.host.dataset.theme = 'dark'
    return {
      sameRoot: first.context.getRoot() === root,
      sameContent: first.context.getSlideElement(1).firstChild === content,
      firstIndex: first.carousel.getIndex(), secondIndex: second.carousel.getIndex(),
    }
  })
  const switched = await appearance(page, 'first')
  expect(switched.arrow).toEqual(dark.arrow)
  expect(switched.radius).toBe('16px')
  expect(switched.content).toEqual(light.content)
  expect(await appearance(page, 'second')).toEqual(dark)
  expect(identities).toEqual({ sameRoot: true, sameContent: true, firstIndex: 1, secondIndex: 0 })
  await page.evaluate(() => { window.themingFixtures.first.host.dataset.theme = 'light' })
  expect((await appearance(page, 'first')).arrow).toEqual(light.arrow)
  expect((await appearance(page, 'second')).arrow).toEqual(dark.arrow)
})

test('host themes survive updates, breakpoint rebuilds and destroy/remount', async ({ page }) => {
  await openFixture(page, '#persistent{--carousel-arrow-size:46px;--carousel-thumb-width:75px;--carousel-thumb-height:45px;--carousel-radius:14px;--carousel-dot-width:20px;--carousel-dot-height:6px}')
  await mount(page, { id: 'persistent' })
  const initial = await appearance(page, 'persistent')
  await page.evaluate(() => {
    const { carousel } = window.themingFixtures.persistent
    carousel.goTo(1)
    carousel.update({ breakpoints: { 600: { slidesPerView: 2, gap: 16 } } })
    carousel.addSlide({ content: '<article>Added slide</article>' })
  })
  expect(await appearance(page, 'persistent')).toEqual(initial)
  await page.setViewportSize({ width: 480, height: 900 })
  await expect.poll(() => page.evaluate(() => window.themingFixtures.persistent.context.getSlidesPerView())).toBe(1)
  expect(await appearance(page, 'persistent')).toEqual(initial)
  const removed = await page.evaluate(() => {
    const fixture = window.themingFixtures.persistent
    fixture.carousel.destroy()
    const children = fixture.host.childElementCount
    fixture.remount()
    return children
  })
  expect(removed).toBe(0)
  expect(await appearance(page, 'persistent')).toEqual(initial)
})

test('icon tokens size built-in arrows while custom SVG sizes and thumbnail option fallbacks remain intact', async ({ page }) => {
  await openFixture(page, '.theming-host{--carousel-arrow-icon-size:32px}')
  await mount(page, { id: 'builtin' })
  await mount(page, { id: 'custom', customArrows: true, thumbnails: { width: 70, height: 50 } })
  expect((await appearance(page, 'builtin')).icon).toEqual({ width: '32px', height: '32px' })
  const custom = await appearance(page, 'custom')
  expect(custom.icon).toEqual({ width: '17px', height: '19px' })
  expect(custom.thumb).toMatchObject({ width: '70px', height: '50px' })
})

test('hover and keyboard focus use theme tokens without resetting ordinary CSS borders', async ({ page }) => {
  await openFixture(page, `
    #focused{--carousel-arrow-bg:rgb(20,21,22);--carousel-arrow-bg-hover:rgb(60,61,62);--carousel-arrow-color-hover:rgb(240,241,242);--carousel-focus-color:rgb(255,210,0);--carousel-focus-width:3px;--carousel-focus-offset:4px;--carousel-control-duration:0ms}
    .theming-host .carousel__arrow{border:2px solid rgb(123,124,125)}
  `)
  await mount(page, { id: 'focused', keyboard: true })
  const root = page.locator('#focused .carousel')
  const next = page.locator('#focused .carousel__arrow--next')
  await page.keyboard.press('Tab')
  for (const control of [root, next, page.locator('#focused .carousel__dot').first(), page.locator('#focused .carousel__thumb').first()]) {
    await control.focus()
    const outline = await control.evaluate(element => {
      const style = getComputedStyle(element)
      return { visible: element.matches(':focus-visible'), width: style.outlineWidth, color: style.outlineColor, offset: style.outlineOffset, kind: style.outlineStyle }
    })
    expect(outline).toEqual({ visible: true, width: '3px', color: 'rgb(255, 210, 0)', offset: '4px', kind: 'solid' })
  }
  await next.hover()
  const hovered = (await appearance(page, 'focused')).arrow
  expect(hovered.background).toBe('rgb(60, 61, 62)')
  expect(hovered.color).toBe('rgb(240, 241, 242)')
  expect(hovered.borderWidth).toBe('2px')
})

test('large themed thumbnails remain reachable on mobile and small strips remain centred', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await openFixture(page, `
    *{box-sizing:content-box}
    .theming-host{--carousel-thumb-width:84px;--carousel-thumb-height:56px;--carousel-thumb-border-width:4px;--carousel-thumb-gap:10px;--carousel-dot-width:16px;--carousel-dot-height:8px}
  `)
  await mount(page, { id: 'overflowing', count: 8 })
  await mount(page, { id: 'compact', count: 2 })
  const result = await page.evaluate(() => {
    const strip = document.querySelector('#overflowing .carousel__thumbnails')
    const bounds = strip.getBoundingClientRect()
    strip.scrollLeft = 0
    const startGap = strip.firstElementChild.getBoundingClientRect().left - bounds.left
    strip.scrollLeft = strip.scrollWidth
    const endGap = bounds.right - strip.lastElementChild.getBoundingClientRect().right
    const compact = document.querySelector('#compact .carousel__thumbnails')
    const compactBounds = compact.getBoundingClientRect()
    return {
      startGap, endGap, overflowing: strip.scrollWidth > strip.clientWidth,
      thumbWidths: [...strip.children].map(thumb => thumb.getBoundingClientRect().width),
      thumbHeights: [...strip.children].map(thumb => thumb.getBoundingClientRect().height),
      leftSpace: compact.firstElementChild.getBoundingClientRect().left - compactBounds.left,
      rightSpace: compactBounds.right - compact.lastElementChild.getBoundingClientRect().right,
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
    }
  })
  expect(result.overflowing).toBe(true)
  expect(Math.abs(result.startGap)).toBeLessThan(1)
  expect(Math.abs(result.endGap)).toBeLessThan(1)
  expect(result.thumbWidths).toEqual(Array(8).fill(84))
  expect(result.thumbHeights).toEqual(Array(8).fill(56))
  expect(result.leftSpace).toBeGreaterThan(0)
  expect(Math.abs(result.leftSpace - result.rightSpace)).toBeLessThan(1)
  expect(result.documentFits).toBe(true)
})

test('control timing is themeable and reduced motion overrides control and lazy-load animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openFixture(page, '#motion{--carousel-control-duration:800ms;--carousel-control-timing:linear;--carousel-lazy-fade-duration:700ms}')
  await mount(page, { id: 'motion', lazy: true })
  const arrow = page.locator('#motion .carousel__arrow--next')
  const slide = page.locator('#motion .carousel__slide').first()
  await expect(slide).toHaveClass(/carousel__slide--loaded/)
  const normal = await arrow.evaluate(element => {
    const style = getComputedStyle(element)
    return { durations: style.transitionDuration.split(',').map(value => value.trim()), timings: style.transitionTimingFunction.split(',').map(value => value.trim()) }
  })
  expect(normal.durations.every(value => value === '0.8s')).toBe(true)
  expect(normal.timings.every(value => value === 'linear')).toBe(true)
  expect(await slide.evaluate(element => getComputedStyle(element).animationDuration)).toBe('0.7s')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await arrow.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  expect(await slide.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
})

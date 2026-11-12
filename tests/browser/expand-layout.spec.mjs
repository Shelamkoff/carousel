import { test, expect } from '@playwright/test'

async function mount(page, options = {}, count = 5) {
  await page.route('**/__expand__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
      </head><body><div id="host" style="width:700px"></div></body></html>`,
  }))
  await page.goto('/__expand__')
  await page.evaluate(async ({ options, count }) => {
    const { Carousel, createSwipe } = await import('/src/index.js')
    const inputs = []
    let context
    const slides = Array.from({ length: count }, (_, index) => ({
      content: () => {
        const card = document.createElement('article')
        card.className = 'carousel__expand-card'
        card.innerHTML = `<span class="carousel__expand-badge">STORY</span>
          <div class="carousel__expand-caption"><h3 class="carousel__expand-title">Story ${index + 1}</h3>
          <p class="carousel__expand-meta">Caption ${index + 1}</p></div>`
        const input = document.createElement('input')
        input.name = `item-${index}`
        input.value = `value-${index}`
        input.style.position = 'absolute'
        input.style.bottom = '12px'
        card.append(input)
        inputs.push(input)
        return card
      },
    }))
    const carousel = new Carousel(document.getElementById('host'), slides, {
      layout: 'expand', expandVisible: 2.5, expandRatio: 2.5, expandPeek: 32,
      gap: 18, loop: true, transitionDuration: 160,
      ...options,
      plugins: [createSwipe({ mouse: true }), { name: 'expand-probe', install(ctx) { context = ctx } }],
    })
    window.expandTest = { carousel, get context() { return context }, inputs }
  }, { options, count })
}

function snapshot() {
  const { context } = window.expandTest
  const slides = context.getSlideElements()
  const view = context.getViewport().getBoundingClientRect()
  const nodes = slides.slice(0, 3)
  return {
    rects: nodes.map(el => {
      const rect = el.getBoundingClientRect()
      const title = el.querySelector('.carousel__expand-title')
      const caption = el.querySelector('.carousel__expand-caption')
      return {
        x: rect.left - view.left, y: rect.top - view.top, width: rect.width, height: rect.height,
        focus: Number(el.style.getPropertyValue('--carousel-expand-focus')),
        size: parseFloat(getComputedStyle(title).fontSize),
        bottom: parseFloat(getComputedStyle(caption).bottom),
      }
    }),
    view: { width: view.width, height: view.height },
  }
}

test('expanded cards and captions interpolate continuously at a half-swipe', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await mount(page)
  const result = await page.evaluate((source) => {
    const take = eval('(' + source + ')')
    const ctx = window.expandTest.context
    const initial = take()
    ctx.setPositionDrag(ctx.getStep() / 2)
    const middle = take()
    ctx.setPosition(0)
    const restored = take()
    return { initial, middle, restored }
  }, snapshot.toString())
  const [a, b] = result.initial.rects
  expect(a.width).toBeGreaterThan(b.width * 2)
  expect(a.focus).toBe(1)
  expect(b.focus).toBe(0)
  expect(a.x).toBeCloseTo(32, 1)
  const [midA, midB] = result.middle.rects
  expect(midA.width).toBeCloseTo(midB.width, 1)
  expect(midA.focus).toBeCloseTo(.5, 4)
  expect(midB.focus).toBeCloseTo(.5, 4)
  expect(midB.x - midA.x - midA.width).toBeCloseTo(18, 1)
  expect(midA.size).toBeLessThan(a.size)
  expect(midA.bottom).toBeLessThan(a.bottom)
  expect(result.restored.rects[0].width).toBeCloseTo(a.width, 1)
  expect(errors).toEqual([])
})

test('short loop uses inert copies and keeps live inputs during forward/backward navigation', async ({ page }) => {
  await mount(page, { transitionDuration: 90 }, 2)
  const result = await page.evaluate(async () => {
    const { carousel, context } = window.expandTest
    const originals = context.getSlideElements()
    const content = originals.map(el => el.firstChild)
    const input = originals[0].querySelector('input')
    input.value = 'typed value'
    const copies = context.getVisualElements().filter(el => 'carouselCopy' in el.dataset)
    const before = copies.map(el => ({ hidden: el.getAttribute('aria-hidden'), inert: el.inert }))
    for (const action of ['next', 'next', 'prev']) {
      const done = new Promise(resolve => carousel.once('transition:end', resolve))
      carousel[action]()
      await done
    }
    return {
      index: carousel.getIndex(), visualCount: context.getVisualElements().length,
      copies: before, value: input.value,
      preserved: originals.every((el, index) => el.firstChild === content[index]),
    }
  })
  expect(result.index).toBe(1)
  expect(result.visualCount).toBeGreaterThan(2)
  expect(result.copies.every(copy => copy.hidden === 'true' && copy.inert)).toBe(true)
  expect(result.value).toBe('typed value')
  expect(result.preserved).toBe(true)
})

test('expanded layout handles finite end, responsive resize and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount(page, { loop: false, transitionDuration: 500 }, 3)
  const result = await page.evaluate(async source => {
    const take = eval('(' + source + ')')
    const { carousel, context } = window.expandTest
    carousel.goTo(2)
    const end = take()
    document.getElementById('host').style.width = '420px'
    await new Promise(resolve => setTimeout(resolve, 100))
    const resized = take()
    carousel.prev()
    const index = carousel.getIndex()
    return { end, resized, index }
  }, snapshot.toString())
  expect(result.index).toBe(1)
  expect(result.end.rects[2].width).toBeGreaterThan(result.end.rects[1].width)
  expect(result.end.rects[2].x + result.end.rects[2].width).toBeLessThanOrEqual(700)
  expect(result.resized.view.width).toBe(420)
  expect(result.resized.rects[2].width).toBeLessThan(result.end.rects[2].width)
})

test('expanded layout supports vertical cards and updates without changing the active index', async ({ page }) => {
  await mount(page, { orientation: 'vertical', viewportHeight: 430, startIndex: 2, transitionDuration: 0 })
  const result = await page.evaluate(source => {
    const take = eval('(' + source + ')')
    const { carousel } = window.expandTest
    const initial = take()
    carousel.update({ orientation: 'horizontal', expandRatio: 3 })
    return { initial, next: take(), index: carousel.getIndex() }
  }, snapshot.toString())
  expect(result.initial.rects[2].height).toBeGreaterThan(result.initial.rects[1].height)
  expect(result.initial.rects[2].width).toBeCloseTo(700, 1)
  expect(result.initial.view.height).toBe(430)
  expect(result.next.rects[2].width).toBeGreaterThan(result.next.rects[1].width)
  expect(result.index).toBe(2)
})

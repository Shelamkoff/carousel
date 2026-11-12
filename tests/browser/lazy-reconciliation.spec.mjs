import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__lazy_reconciliation__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__lazy_reconciliation__')
})

test('a replaced lazy slide cannot inherit completion from the retired content render', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel, createLazyLoad } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '400px'
    document.body.append(host)
    const counts = { old: 0, replacement: 0 }
    const card = text => Object.assign(document.createElement('article'), { textContent: text })
    const carousel = new Carousel(host, [
      { id: 'first', lazy: true, content: () => card('First') },
      { id: 'second', lazy: true, content: () => { counts.old++; return card('Old second') } },
    ], { transitionDuration: 0, plugins: [createLazyLoad({ preload: 0, rootMargin: '0px' })] })
    try {
      let armed = true
      carousel.on('render', () => {
        if (!armed || carousel.getSlideElement(1).dataset.rendered !== 'true') return
        armed = false
        carousel.updateSlide(1, { content: () => { counts.replacement++; return card('New second') } })
      })
      const loaded = []
      carousel.on('slide:lazyload', ({ index, element }) => loaded.push({
        index, text: element.textContent, rendered: element.dataset.rendered ?? null,
      }))

      carousel.goTo(1)
      carousel.goTo(1)

      return { index: carousel.getIndex(), text: carousel.getSlideElement(1).textContent, counts, loaded }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({ index: 1, text: 'New second', counts: { old: 1, replacement: 1 },
    loaded: [{ index: 1, text: 'New second', rendered: 'true' }] })
})

test('a visible lazy replacement remains observed after cancelling its prior render', async ({ page }) => {
  await page.evaluate(async () => {
    const { Carousel, createLazyLoad } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '600px'
    document.body.append(host)
    const card = text => Object.assign(document.createElement('article'), {
      textContent: text, style: 'height:160px',
    })
    const counts = { old: 0, replacement: 0 }
    const carousel = new Carousel(host, [
      { id: 'first', content: () => card('First') },
      { id: 'second', lazy: true, content: () => { counts.old++; return card('Old second') } },
      { id: 'third', lazy: true, content: () => card('Third') },
    ], { slidesPerView: 1.5, transitionDuration: 0,
      plugins: [createLazyLoad({ preload: 0, rootMargin: '0px' })] })
    let armed = true
    carousel.on('render', () => {
      if (!armed || carousel.getSlideElement(1).dataset.rendered !== 'true') return
      armed = false
      carousel.updateSlide(1, { content: () => { counts.replacement++; return card('New second') } })
    })
    window.lazyReentryFixture = { carousel, host, counts }
  })
  try {
    await expect.poll(() => page.evaluate(() => {
      const { carousel, counts } = window.lazyReentryFixture
      return { text: carousel.getSlideElement(1).textContent, counts }
    })).toEqual({ text: 'New second', counts: { old: 1, replacement: 1 } })
  } finally {
    await page.evaluate(() => {
      const { carousel, host } = window.lazyReentryFixture
      carousel.destroy(); host.remove(); delete window.lazyReentryFixture
    })
  }
})

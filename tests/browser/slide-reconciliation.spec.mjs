import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__slide_reconciliation__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__slide_reconciliation__')
})

test('inserting a repeated slide preserves each existing input and the selected occurrence', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '400px'
    document.body.append(host)
    const repeated = { content: () => document.createElement('input') }
    const carousel = new Carousel(host, [repeated, repeated], { transitionDuration: 0, startIndex: 1 })
    try {
      const original = carousel.getSlideElements()
      original[0].firstElementChild.value = 'First occurrence'
      original[1].firstElementChild.value = 'Second occurrence'
      carousel.addSlide(repeated, 0)
      return {
        retained: [carousel.getSlideElement(1) === original[0], carousel.getSlideElement(2) === original[1]],
        selected: carousel.getSlideElement() === original[1],
        values: carousel.getSlideElements().map(slide => slide.firstElementChild.value),
      }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({ retained: [true, true], selected: true,
    values: ['', 'First occurrence', 'Second occurrence'] })
})

test('a connected callback that replaces the collection retires newly inserted stale DOM', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '400px'
    document.body.append(host)
    let carousel
    let armed = false
    customElements.define('reconciliation-connected-probe', class extends HTMLElement {
      connectedCallback() {
        if (!armed) return
        armed = false
        carousel.setSlides([{ id: 'latest', content: '<article>Latest collection</article>' }])
      }
    })
    carousel = new Carousel(host, [{ id: 'first', content: 'First' }, { id: 'second', content: 'Second' }],
      { transitionDuration: 0 })
    try {
      armed = true
      carousel.addSlide({ id: 'interrupted', content: '<reconciliation-connected-probe>Stale</reconciliation-connected-probe>' }, 0)
      return {
        ids: carousel.getSlides().map(slide => slide.id),
        children: [...host.querySelector('.carousel__track').children].map(slide => slide.textContent),
        tracked: carousel.getSlideElements().every(slide => slide.isConnected),
      }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({ ids: ['latest'], children: ['Latest collection'], tracked: true })
})

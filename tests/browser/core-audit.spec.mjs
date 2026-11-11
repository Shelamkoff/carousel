import { test, expect } from '@playwright/test'

const fixture = `<!doctype html><html><head>
  <link rel="stylesheet" href="/styles/carousel.css">
  <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
  </head><body></body></html>`

test.beforeEach(async ({ page }) => {
  await page.route('**/__core_audit__', route => route.fulfill({ contentType: 'text/html', body: fixture }))
  await page.goto('/__core_audit__')
})

test('finite fractional layouts reach one stable final logical index', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel, createArrows, createDots } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '280px'
    document.body.append(host)
    const carousel = new Carousel(host, Array.from({ length: 5 }, (_, index) => ({ content: String(index) })), {
      slidesPerView: 2.8, transitionDuration: 0,
      plugins: [createArrows(), createDots()],
    })
    let changes = 0
    carousel.on('slide:change', () => changes++)
    carousel.goTo(3)
    const finalIndex = carousel.getIndex()
    const finalChanges = changes
    carousel.next()
    carousel.next()
    const result = { finalIndex, finalChanges, changes, index: carousel.getIndex() }
    carousel.destroy()
    return result
  })
  expect(result.finalIndex).toBe(3)
  expect(result.index).toBe(3)
  expect(result.changes).toBe(result.finalChanges)
})

test('interrupting a finite transition at its rounded index settles to an aligned position', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '100px'
    document.body.append(host)
    let context
    const carousel = new Carousel(host, Array.from({ length: 5 }, (_, index) => ({ content: String(index) })), {
      transitionDuration: 500,
      plugins: [{ name: 'position-observer', install(ctx) { context = ctx } }],
    })
    carousel.goTo(1)
    while (context.getPosition() < 60) await new Promise(requestAnimationFrame)
    carousel.goTo(1)
    await new Promise(resolve => setTimeout(resolve, 600))
    const result = { index: carousel.getIndex(), position: context.getPosition(), step: context.getStep() }
    carousel.destroy()
    return result
  })
  expect(result.index).toBe(1)
  expect(result.position).toBeCloseTo(result.step, 5)
})

test('several resizes during one transition preserve its destination', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '100px'
    document.body.append(host)
    const carousel = new Carousel(host, Array.from({ length: 6 }, (_, index) => ({ content: String(index) })), {
      transitionDuration: 600,
    })
    const frames = async () => {
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame)
    }
    await frames()
    carousel.goTo(3)
    host.style.width = '400px'
    await frames()
    host.style.width = '800px'
    await frames()
    await new Promise(resolve => setTimeout(resolve, 750))
    const result = { index: carousel.getIndex(), width: host.querySelector('.carousel__slide').offsetWidth }
    carousel.destroy()
    return result
  })
  expect(result.width).toBe(800)
  expect(result.index).toBe(3)
})

test('same-origin iframe elements use the owning viewport for responsive options', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const frame = document.createElement('iframe')
    frame.style.width = '320px'
    frame.src = '/__core_audit__'
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
    document.body.append(frame)
    await loaded
    const doc = frame.contentDocument
    const host = doc.createElement('div')
    host.style.width = '300px'
    doc.body.append(host)
    const element = doc.createElement('button')
    element.textContent = 'Iframe slide'
    let context
    const carousel = new Carousel(host, [{ content: element }, { content: 'Second' }, { content: 'Third' }], {
      transitionDuration: 0,
      breakpoints: { 600: { slidesPerView: 3 } },
      plugins: [{ name: 'options-observer', install(ctx) { context = ctx } }],
    })
    const initial = context.getSlidesPerView()
    frame.style.width = '800px'
    await new Promise(resolve => setTimeout(resolve, 100))
    const expanded = context.getSlidesPerView()
    const retained = host.querySelector('button') === element
    const content = host.querySelector('button')?.textContent
    carousel.destroy()
    frame.remove()
    return { initial, expanded, retained, content }
  })
  expect(result).toEqual({ initial: 1, expanded: 3, retained: false, content: 'Iframe slide' })
})

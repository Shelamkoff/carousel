import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__effects_contract__', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__effects_contract__')
})

test('fade restores inline style priority after completion and cancellation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '500px'
    document.body.append(host)
    const carousel = new Carousel(host, [0, 1, 2].map(index => ({
      content: `<article style="height:160px">Slide ${index}</article>`,
    })), { transition: 'fade', transitionDuration: 50 })
    const first = carousel.getSlideElement(0)
    first.style.setProperty('opacity', '.7', 'important')
    first.style.setProperty('visibility', 'visible', 'important')
    const read = () => ['opacity', 'visibility'].map(property => ({
      property, value: first.style.getPropertyValue(property),
      priority: first.style.getPropertyPriority(property),
    }))
    const expected = read()
    try {
      const end = new Promise(resolve => carousel.once('transition:end', resolve))
      carousel.next()
      await end
      const completed = read()
      carousel.prev()
      carousel.update({ gap: 10 })
      return { expected, completed, cancelled: read() }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result.completed).toEqual(result.expected)
  expect(result.cancelled).toEqual(result.expected)
})

test('an error from a retired effect render cannot dispose its replacement instance', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel, createSlideEffect } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '500px'
    document.body.append(host)
    const carousel = new Carousel(host, [{ content: 'A' }, { content: 'B' }], { transitionDuration: 0 })
    let instances = 0
    let replace = false
    const destroyed = []
    const rendered = []
    const errors = []
    carousel.on('effect:error', value => errors.push(value.error.message))
    const effect = createSlideEffect({ name: 'replaceable', create({ setStyle }) {
      const instance = ++instances
      return {
        render(state) {
          rendered.push(instance)
          if (instance === 1 && replace) {
            replace = false
            carousel.unuse(effect.name)
            carousel.use(effect)
            throw new Error('retired render failed')
          }
          for (const slide of state.slides) setStyle(slide.element, '--effect-instance', String(instance))
        },
        destroy() { destroyed.push(instance) },
      }
    } })
    try {
      carousel.use(effect)
      replace = true
      carousel.next()
      await Promise.resolve()
      carousel.prev()
      return { instances, destroyed: [...destroyed], rendered, errors,
        value: carousel.getSlideElement(0).style.getPropertyValue('--effect-instance') }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result.instances).toBe(2)
  expect(result.destroyed).toEqual([1])
  expect(result.rendered).toContain(2)
  expect(result.value).toBe('2')
  expect(result.errors).toEqual([])
})

test('a prior render listener can replace slides without disabling later effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel, createSlideEffect } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '500px'
    document.body.append(host)
    const carousel = new Carousel(host, [{ id: 'a', content: 'A' }, { id: 'b', content: 'B' }],
      { transitionDuration: 0 })
    let replace = false
    let destroyed = 0
    const errors = []
    carousel.on('effect:error', value => errors.push(value.error.message))
    carousel.on('render', () => {
      if (!replace) return
      replace = false
      carousel.setSlides([{ id: 'new-a', content: 'New A' }, { id: 'new-b', content: 'New B' }])
    })
    const effect = createSlideEffect({ name: 'after-rebuild', create({ setStyle }) {
      return {
        render(state) {
          for (const slide of state.slides) setStyle(slide.element, '--frame-focus', String(slide.focus))
        },
        destroy() { destroyed++ },
      }
    } })
    try {
      carousel.use(effect)
      replace = true
      carousel.next()
      carousel.goTo(0)
      return { errors, destroyed, ids: carousel.getSlides().map(slide => slide.id),
        values: carousel.getSlideElements().map(slide => slide.style.getPropertyValue('--frame-focus')) }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result.errors).toEqual([])
  expect(result.destroyed).toBe(0)
  expect(result.ids).toEqual(['new-a', 'new-b'])
  expect(result.values).toEqual(['1', '0'])
})

test('a superseded reset cannot clear styles and wrappers from a nested rebuild', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel, createSlideEffect, createParallax } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '500px'
    document.body.append(host)
    const carousel = new Carousel(host, [{ id: 'a', content: 'A' }, { id: 'b', content: 'B' }],
      { transitionDuration: 0 })
    let replace = false
    const errors = []
    carousel.on('effect:error', value => errors.push(value.error.message))
    carousel.on('render:reset', () => {
      if (!replace) return
      replace = false
      carousel.setSlides([{ id: 'new-a', content: 'New A' }, { id: 'new-b', content: 'New B' }])
    })
    carousel.use(createSlideEffect({ name: 'nested-reset', create({ setStyle }) {
      return { render(state) {
        for (const slide of state.slides) setStyle(slide.element, '--frame-focus', String(slide.focus))
      } }
    } })).use(createParallax())
    try {
      replace = true
      carousel.update({ gap: 10 })
      return { errors, ids: carousel.getSlides().map(slide => slide.id),
        values: carousel.getSlideElements().map(slide => slide.style.getPropertyValue('--frame-focus')),
        wrappers: host.querySelectorAll('.carousel__parallax').length }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result.errors).toEqual([])
  expect(result.ids).toEqual(['new-a', 'new-b'])
  expect(result.values).toEqual(['1', '0'])
  expect(result.wrappers).toBe(2)
})

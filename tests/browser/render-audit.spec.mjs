import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__render_audit__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
      </head><body></body></html>`,
  }))
  await page.goto('/__render_audit__')
})

for (const lazy of [false, true]) {
  test(`visual copies leave form values, validation and radio selection to originals (lazy ${lazy})`, async ({ page }) => {
    const result = await page.evaluate(async lazy => {
      const { Carousel } = await import('/src/index.js')
      const form = document.createElement('form')
      form.style.width = '400px'
      document.body.append(form)
      const content = document.createElement('section')
      content.innerHTML = '<input name="title" value="correct"><input type="radio" name="plan" value="basic" checked><input name="required" required>'
      let context
      const carousel = new Carousel(form, [{ content: () => content, lazy }], {
        loop: true, slidesPerView: 1, transitionDuration: 0,
        plugins: [{ name: 'render-probe', install(ctx) { context = ctx } }],
      })
      if (lazy) context.renderSlide(0)
      content.querySelector('[name="required"]').value = 'filled'
      const snapshot = {
        values: [...new FormData(form)],
        radioChecked: content.querySelector('[name="plan"]').checked,
        valid: form.checkValidity(),
        copies: form.querySelectorAll('[data-carousel-copy]').length,
      }
      carousel.destroy()
      form.remove()
      return snapshot
    }, lazy)
    expect(result.copies).toBe(1)
    expect(result.values).toEqual([['title', 'correct'], ['plan', 'basic'], ['required', 'filled']])
    expect(result.radioChecked).toBe(true)
    expect(result.valid).toBe(true)
  })
}

test('render functions accept foreign HTML elements after adoption', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const host = document.createElement('div')
    host.style.width = '400px'
    document.body.append(host)
    const content = frame.contentDocument.createElement('article')
    content.textContent = 'Foreign content'
    let activations = 0
    content.addEventListener('click', () => activations++)
    const carousel = new Carousel(host, [{ content: () => content }], { transitionDuration: 0 })
    const first = host.querySelector('article')
    first?.click()
    carousel.refresh(0)
    const second = host.querySelector('article')
    second?.click()
    const snapshot = { rendered: !!first, preserved: second === content, activations, errors: host.querySelectorAll('.carousel__slide--error').length }
    carousel.destroy()
    frame.remove()
    host.remove()
    return snapshot
  })
  expect(result).toEqual({ rendered: true, preserved: true, activations: 2, errors: 0 })
})

test('destroying the carousel from a render function retires the active rebuild', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '400px'
    document.body.append(host)
    let carousel
    let calls = 0
    carousel = new Carousel(host, [{ content: () => {
      if (++calls > 1) carousel.destroy()
      return document.createElement('article')
    } }], { loop: true, transitionDuration: 0 })
    let error = null
    try { carousel.refresh() } catch (failure) { error = failure.message }
    const snapshot = { error, children: host.childElementCount }
    host.remove()
    return snapshot
  })
  expect(result).toEqual({ error: null, children: 0 })
})

test('a reentrant update keeps the newest layout and retires the outer rebuild', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '400px'
    document.body.append(host)
    let carousel
    let calls = 0
    let context
    const slides = [{ content: () => {
      if (++calls === 2) carousel.update({ slidesPerView: 2, gap: 8 })
      return document.createElement('article')
    } }, { content: '<article>Second</article>' }]
    carousel = new Carousel(host, slides, {
      transitionDuration: 0,
      plugins: [{ name: 'layout-probe', install(ctx) { context = ctx } }],
    })
    carousel.refresh()
    const snapshot = {
      widths: context.getSlideElements().map(slide => slide.style.width),
      gap: context.getTrack().style.gap,
      slidesPerView: context.options.slidesPerView,
    }
    carousel.destroy()
    host.remove()
    return snapshot
  })
  expect(result).toEqual({ widths: ['196px', '196px'], gap: '8px', slidesPerView: 2 })
})

test('lazy rendering reports cancellation when its factory removes the slide', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '400px'
    document.body.append(host)
    let carousel
    let context
    carousel = new Carousel(host, [{ lazy: true, content: () => {
      carousel.removeSlide(0)
      const article = document.createElement('article')
      article.textContent = 'Removed'
      return article
    } }, { content: '<article>Retained</article>' }], {
      loop: true, transitionDuration: 0,
      plugins: [{ name: 'render-probe', install(ctx) { context = ctx } }],
    })
    const rendered = context.renderSlide(0)
    const snapshot = { rendered, count: carousel.getSlides().length, text: context.getSlideElement(0).textContent }
    carousel.destroy()
    host.remove()
    return snapshot
  })
  expect(result).toEqual({ rendered: false, count: 1, text: 'Retained' })
})

for (const phase of ['disconnect', 'connect', 'lazy-connect']) {
  for (const action of ['destroy', 'update']) {
    test(`visual copy ${phase} never runs application ${action} callbacks`, async ({ page }) => {
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const result = await page.evaluate(async ({ phase, action }) => {
        const { Carousel } = await import('/src/index.js')
        const host = document.createElement('div')
        host.style.width = '400px'
        document.body.append(host)
        let carousel
        let context
        let armed = false
        let callbacks = 0
        const react = element => {
          if (!armed || !element.closest('[data-carousel-copy]')) return
          armed = false
          callbacks++
          if (action === 'destroy') carousel.destroy()
          else carousel.update({ slidesPerView: 3, gap: 8 })
        }
        customElements.define('carousel-reentry-probe', class extends HTMLElement {
          connectedCallback() { if (phase !== 'disconnect') react(this) }
          disconnectedCallback() { if (phase === 'disconnect') react(this) }
        })
        carousel = new Carousel(host, [{
          lazy: phase === 'lazy-connect',
          content: () => document.createElement('carousel-reentry-probe'),
        }], {
          loop: true, slidesPerView: 2, transitionDuration: 0,
          plugins: [{ name: 'copy-probe', install(ctx) { context = ctx } }],
        })
        armed = true
        let error = null
        let rendered = null
        try {
          if (phase === 'lazy-connect') rendered = context.renderSlide(0)
          else carousel.update({ gap: 4 })
        } catch (failure) { error = failure.message }
        const snapshot = {
          callbacks, error, rendered,
          children: host.childElementCount,
          copies: host.querySelectorAll('[data-carousel-copy]').length,
          widths: [...host.querySelectorAll('.carousel__slide')].map(slide => slide.style.width),
        }
        carousel.destroy()
        host.remove()
        return snapshot
      }, { phase, action })
      expect(result.callbacks).toBe(0)
      expect(result.error).toBeNull()
      expect(result.rendered).toBe(phase === 'lazy-connect' ? true : null)
      expect(result.children).toBe(1)
      expect(result.copies).toBe(2)
      expect(result.widths).toEqual(Array(3).fill(phase === 'lazy-connect' ? '200px' : '198px'))
      expect(errors).toEqual([])
    })
  }
}

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
    carousel.update({ gap: 4 })
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
    try { carousel.update({ gap: 4 }) } catch (failure) { error = failure.message }
    const snapshot = { error, children: host.childElementCount }
    host.remove()
    return snapshot
  })
  expect(result).toEqual({ error: null, children: 0 })
})

import { test, expect } from '@playwright/test'

for (const method of ['create', 'render', 'destroy']) {
  test(`a promise from transition ${method} stays inside the transition error boundary`, async ({ page }) => {
    await page.route('**/__transition_contract__', route => route.fulfill({
      contentType: 'text/html', body: `<!doctype html>
        <link rel="stylesheet" href="/styles/carousel.css">
        <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
    }))
    await page.goto('/__transition_contract__')
    const result = await page.evaluate(async method => {
      const { Carousel } = await import('/src/index.js')
      const unhandled = []
      const onUnhandled = event => {
        unhandled.push(event.reason.message)
        event.preventDefault()
      }
      window.addEventListener('unhandledrejection', onUnhandled)
      const host = document.createElement('div')
      host.style.width = '400px'
      document.body.append(host)
      let destroyed = 0
      const reject = () => Promise.reject(new Error(`asynchronous ${method} failure`))
      const transition = {
        name: `async-${method}`,
        create() {
          if (method === 'create') return reject()
          return {
            render() { if (method === 'render') return reject() },
            destroy() { destroyed++; if (method === 'destroy') return reject() },
          }
        },
      }
      const carousel = new Carousel(host, [{ content: 'A' }, { content: 'B' }],
        { transition, transitionDuration: 30 })
      const errors = []
      carousel.on('transition:error', value => errors.push({ name: value.name, message: value.error.message }))
      try {
        const completed = new Promise(resolve => carousel.once('transition:end', resolve))
        carousel.next()
        await completed
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const index = carousel.getIndex()
        const overlays = host.querySelectorAll('.carousel__transition').length
        carousel.update({ transition: 'slide', transitionDuration: 0 })
        carousel.prev()
        return { errors, unhandled, destroyed, index, overlays, nextIndex: carousel.getIndex() }
      } finally {
        carousel.destroy()
        host.remove()
        window.removeEventListener('unhandledrejection', onUnhandled)
      }
    }, method)
    expect(result.unhandled).toEqual([])
    expect(result.errors).toEqual([{ name: `async-${method}`,
      message: `Carousel: transition ${method}() must be synchronous` }])
    expect(result.destroyed).toBe(method === 'create' ? 0 : 1)
    expect(result.index).toBe(1)
    expect(result.overlays).toBe(0)
    expect(result.nextIndex).toBe(0)
  })
}

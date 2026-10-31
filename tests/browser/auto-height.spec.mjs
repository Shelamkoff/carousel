import { test, expect } from '@playwright/test'

for (const loop of [false, true]) for (const mounted of [false, true]) {
  test(`auto-height media resizes without browser errors (${mounted ? 'mounted' : 'detached'} construction, loop ${loop})`, async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.addInitScript(() => {
      window.resizeErrors = []
      window.addEventListener('error', event => window.resizeErrors.push(event.message))
      window.addEventListener('unhandledrejection', event => window.resizeErrors.push(String(event.reason)))
    })
    await page.route('**/__auto_height__', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head>
        <link rel="stylesheet" href="/styles/carousel.css">
        <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
        </head><body></body></html>`,
    }))
    await page.goto('/__auto_height__')
    const result = await page.evaluate(async ({ mounted, loop }) => {
      const { Carousel } = await import('/src/index.js')
      const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
      const host = document.createElement('section')
      host.style.width = '640px'
      const figures = await Promise.all(['Alpha', 'Bravo'].map(async caption => {
        const figure = document.createElement('figure')
        figure.style.margin = '0'
        const image = document.createElement('img')
        image.src = pixel
        image.style.cssText = 'display:block;width:100%;height:auto'
        await image.decode()
        const label = document.createElement('figcaption')
        label.textContent = caption
        label.style.height = '23px'
        figure.append(image, label)
        return figure
      }))
      if (mounted) document.body.append(host)
      const carousel = new Carousel(host, figures.map(content => ({ content: () => content })), { loop, transitionDuration: 0 })
      if (!mounted) document.body.append(host)
      const settle = async () => {
        for (let count = 0; count < 6; count++) await new Promise(requestAnimationFrame)
      }
      const snapshot = () => ({
        viewportWidth: host.querySelector('.carousel__viewport').offsetWidth,
        viewportHeight: host.querySelector('.carousel__viewport').offsetHeight,
        slideWidths: [...host.querySelectorAll('.carousel__slide')].map(slide => slide.offsetWidth),
        slideHeights: [...host.querySelectorAll('.carousel__slide')].map(slide => slide.offsetHeight),
        index: carousel.getIndex(),
      })
      await settle()
      const attached = snapshot()
      carousel.goTo(1)
      host.style.width = '320px'
      await settle()
      const resized = snapshot()
      figures[1].querySelector('figcaption').style.height = '47px'
      await settle()
      const grown = snapshot()
      carousel.destroy()
      await settle()
      return { attached, resized, grown, childrenAfterDestroy: host.childElementCount, errors: window.resizeErrors }
    }, { mounted, loop })
    expect(result.attached.viewportWidth).toBe(640)
    expect(result.attached.slideWidths).toEqual([640, 640])
    expect(result.resized.viewportWidth).toBe(320)
    expect(result.resized.slideWidths).toEqual([320, 320])
    expect(result.attached.viewportHeight - result.resized.viewportHeight).toBe(320)
    expect(result.resized.viewportHeight).toBe(Math.max(...result.resized.slideHeights))
    expect(result.resized.index).toBe(1)
    expect(result.grown.viewportHeight - result.resized.viewportHeight).toBe(24)
    expect(result.grown.viewportHeight).toBe(Math.max(...result.grown.slideHeights))
    expect(result.grown.index).toBe(1)
    expect(result.childrenAfterDestroy).toBe(0)
    expect(result.errors).toEqual([])
    expect(pageErrors).toEqual([])
  })
}

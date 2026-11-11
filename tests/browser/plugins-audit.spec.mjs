import { test, expect } from '@playwright/test'

test('swipe preserves ordinary clicks and suppresses clicks after dragging a slide', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/tests/browser/lifecycle.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await page.evaluate(async () => {
    const { Carousel, createSwipe } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '600px'
    document.body.appendChild(host)
    const content = document.createElement('div')
    content.style.padding = '20px 240px'
    const link = document.createElement('a')
    link.id = 'audit-slide-link'
    link.href = '#audit-target'
    link.textContent = 'Slide link'
    const button = document.createElement('button')
    button.id = 'audit-slide-button'
    button.type = 'button'
    button.textContent = 'Slide button'
    window.__auditClicks = { link: 0, button: 0 }
    window.__auditPointerClicks = 0
    host.addEventListener('click', event => {
      if (event.detail > 0) window.__auditPointerClicks++
    })
    link.addEventListener('click', event => {
      event.preventDefault()
      window.__auditClicks.link++
    })
    button.addEventListener('click', () => { window.__auditClicks.button++ })
    content.append(link, button)
    window.__auditCarousel = new Carousel(host, [
      { content: () => content },
      { content: 'Second slide' },
      { content: 'Third slide' },
    ], { transitionDuration: 0, plugins: [createSwipe({ mouse: true })] })
  })
  await page.locator('#audit-slide-link').click()
  await page.locator('#audit-slide-button').click()
  expect(await page.evaluate(() => window.__auditClicks)).toEqual({ link: 1, button: 1 })
  expect(await page.evaluate(() => window.__auditCarousel.getIndex())).toBe(0)
  const link = await page.locator('#audit-slide-link').boundingBox()
  const startX = link.x + link.width / 2
  const startY = link.y + link.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX - 180, startY, { steps: 6 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.__auditCarousel.getIndex())).toBe(1)
  expect(await page.evaluate(() => window.__auditClicks)).toEqual({ link: 1, button: 1 })
  expect(await page.evaluate(() => window.__auditPointerClicks)).toBe(2)
  await page.evaluate(() => window.__auditCarousel.destroy())
  expect(errors).toEqual([])
})

test('plugins follow keyboard, pointer and lazy rendering events in the owning iframe', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/tests/browser/lifecycle.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const result = await page.evaluate(async () => {
    const { Carousel, createSwipe, createKeyboard, createLazyLoad, createParallax } = await import('/src/index.js')
    const frame = document.createElement('iframe')
    frame.style.width = '650px'
    frame.srcdoc = `<!doctype html><link rel="stylesheet" href="${location.origin}/styles/carousel.css"><div id="host" style="width:600px"></div>`
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
    document.body.appendChild(frame)
    await loaded
    const documentInFrame = frame.contentDocument
    const windowInFrame = frame.contentWindow
    const host = documentInFrame.querySelector('#host')
    const carousel = new Carousel(host, Array.from({ length: 3 }, (_, i) => ({
      lazy: true,
      content: () => {
        const content = documentInFrame.createElement('div')
        content.style.height = '100px'
        content.textContent = `Slide ${i + 1}`
        return content
      },
    })), {
      transitionDuration: 0,
      plugins: [createLazyLoad({ preload: 0 }), createKeyboard({ scope: 'document' }), createSwipe(), createParallax()],
    })
    const viewport = host.querySelector('.carousel__viewport')
    const pointer = (type, x) => new windowInFrame.PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true,
      button: 0, clientX: x, clientY: 20, bubbles: true, cancelable: true,
    })
    viewport.dispatchEvent(pointer('pointerdown', 350))
    windowInFrame.dispatchEvent(pointer('pointermove', 50))
    windowInFrame.dispatchEvent(pointer('pointerup', 50))
    const afterSwipe = carousel.getIndex()
    documentInFrame.body.dispatchEvent(new windowInFrame.KeyboardEvent('keydown', {
      key: 'ArrowRight', bubbles: true, cancelable: true,
    }))
    const afterKeyboard = carousel.getIndex()
    const selected = host.querySelector(`[data-index="${afterKeyboard}"]`)
    const lazyRendered = selected.dataset.loaded === 'true'
    const ownerMatches = selected.ownerDocument === documentInFrame
    carousel.destroy()
    const cleaned = host.children.length === 0
    frame.remove()
    return { afterSwipe, afterKeyboard, lazyRendered, ownerMatches, cleaned }
  })
  expect(result).toEqual({ afterSwipe: 1, afterKeyboard: 2, lazyRendered: true, ownerMatches: true, cleaned: true })
  expect(errors).toEqual([])
})

test('lazy loading preserves the newest successful render after a nested update', async ({ page }) => {
  await page.goto('/tests/browser/lifecycle.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const result = await page.evaluate(async () => {
    const { Carousel, createLazyLoad } = await import('/src/index.js')
    const host = document.createElement('div')
    host.style.width = '600px'
    document.body.appendChild(host)
    let carousel
    let calls = 0
    carousel = new Carousel(host, [{ lazy: true, content: () => {
      const version = ++calls
      if (version === 2) carousel.update({ gap: 8 })
      const content = document.createElement('article')
      content.textContent = `Render ${version}`
      return content
    } }], { transitionDuration: 0, plugins: [createLazyLoad({ preload: 0 })] })
    const originalSlide = host.querySelector('.carousel__slide')
    carousel.update({ gap: 4 })
    const slide = host.querySelector('.carousel__slide')
    const snapshot = {
      sameElement: slide === originalSlide,
      rendered: slide.dataset.rendered,
      loaded: slide.dataset.loaded,
      text: slide.textContent,
    }
    carousel.destroy()
    host.remove()
    return snapshot
  })
  expect(result).toEqual({ sameElement: true, rendered: 'true', loaded: 'true', text: 'Render 3' })
})

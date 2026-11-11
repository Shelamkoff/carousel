import { test, expect } from '@playwright/test'

test('gallery controls toggle and inherit themes without remounting slide content', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?slidesPerView=1.15#gallery-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const gallery = page.locator('#demo-gallery')
  await gallery.getByRole('button', { name: 'Pause autoplay', exact: true }).click()
  await expect(gallery.getByRole('button', { name: 'Play autoplay', exact: true })).toBeVisible()
  await expect(gallery.locator('.carousel__counter')).toHaveText(/\d \/ 7/)
  await page.evaluate(() => {
    window.galleryNodes = [...document.querySelectorAll('#demo-gallery .carousel, #demo-gallery .carousel__slide, #demo-gallery .gallery-card')]
  })
  await page.getByLabel('Gallery theme', { exact: true }).selectOption('dark')
  await gallery.locator('.carousel__play-pause').hover()
  await expect(gallery.locator('.carousel__play-pause')).toHaveCSS('background-color', 'rgb(54, 67, 88)')
  await page.getByLabel('Gallery theme', { exact: true }).hover()
  await expect(gallery.locator('.carousel__play-pause')).toHaveCSS('background-color', 'rgb(37, 45, 59)')
  await expect(gallery.locator('.carousel__progress-ring > .carousel__progress-value')).toHaveCSS('stroke', 'rgb(154, 186, 255)')
  await expect(gallery.locator('.carousel__counter')).toHaveCSS('color', 'rgb(240, 243, 249)')
  await page.getByLabel('Progress indicator', { exact: true }).selectOption('bar')
  await expect(gallery.locator('.carousel__autoplay-progress--bar')).toBeVisible()
  await page.getByLabel('Show slide counter', { exact: true }).uncheck()
  await expect(gallery.locator('.carousel__counter')).toBeHidden()
  await page.getByLabel('Show Play/Pause', { exact: true }).uncheck()
  await expect(gallery.locator('.carousel__play-pause')).toBeHidden()
  await page.getByLabel('Progress indicator', { exact: true }).selectOption('off')
  await expect(gallery.locator('.carousel__controls')).toBeHidden()
  await page.getByLabel('Show Play/Pause', { exact: true }).check()
  await page.getByLabel('Show slide counter', { exact: true }).check()
  await page.getByLabel('Progress indicator', { exact: true }).selectOption('circle')
  await page.getByLabel('Gallery theme', { exact: true }).selectOption('compact')
  await expect(gallery.locator('.carousel__play-pause')).toHaveCSS('width', '30px')
  await expect(gallery.locator('.carousel__autoplay-progress')).toHaveCSS('width', '26px')
  await expect(gallery.locator('.carousel__counter')).toHaveCSS('font-size', '12px')
  expect(await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#demo-gallery .carousel, #demo-gallery .carousel__slide, #demo-gallery .gallery-card')]
    return nodes.length === window.galleryNodes.length && nodes.every((node, index) => node === window.galleryNodes[index])
  })).toBe(true)
  expect(errors).toEqual([])
})

test('vertical fractional demo works on mobile and overlay controls avoid the navigation arrows', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/?orientation=vertical&slidesPerView=2.25#gallery-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const gallery = page.locator('#demo-gallery')
  await gallery.getByRole('button', { name: 'Pause autoplay', exact: true }).click()
  await expect(gallery.locator('.carousel')).toHaveClass(/carousel--vertical/)
  await expect(gallery.locator('.carousel__viewport')).toHaveCSS('height', '420px')
  await expect(gallery.locator('.carousel__viewport')).toHaveCSS('touch-action', 'pan-x pinch-zoom')
  await expect(page.locator('#gallery-status')).toHaveText('Vertical · 2.25 slides per view · 7 slides')
  await page.getByLabel('Controls position', { exact: true }).selectOption('overlay')
  await gallery.locator('.carousel__viewport').hover()
  const geometry = await gallery.evaluate(host => {
    const rect = selector => host.querySelector(selector).getBoundingClientRect()
    const controls = rect('.carousel__controls')
    const viewport = rect('.carousel__viewport')
    const arrows = [rect('.carousel__arrow--prev'), rect('.carousel__arrow--next')]
    const overlaps = other => controls.left < other.right && controls.right > other.left
      && controls.top < other.bottom && controls.bottom > other.top
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      contained: controls.left >= viewport.left && controls.right <= viewport.right
        && controls.top >= viewport.top && controls.bottom <= viewport.bottom,
      overlapsArrows: arrows.some(overlaps),
      slideHeight: rect('.carousel__slide').height,
    }
  })
  expect(geometry.overflow).toBeLessThanOrEqual(1)
  expect(geometry.contained).toBe(true)
  expect(geometry.overlapsArrows).toBe(false)
  expect(geometry.slideHeight).toBeCloseTo((420 - 16 * 1.25) / 2.25, 1)
  await page.getByLabel('Orientation', { exact: true }).selectOption('horizontal')
  await expect(gallery.locator('.carousel')).not.toHaveClass(/carousel--vertical/)
  await expect(gallery.locator('.carousel__viewport')).toHaveCSS('touch-action', 'pan-y pinch-zoom')
  expect(errors).toEqual([])
})

test('counter-only controls stay below side thumbnails', async ({ page }) => {
  await page.route('**/__gallery_controls_layout__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><link rel="stylesheet" href="/styles/carousel.css"><script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>',
  }))
  await page.goto('/__gallery_controls_layout__')
  const geometry = await page.evaluate(async () => {
    const { Carousel, createControls, createThumbnails } = await import('/src/index.js')
    const result = []
    for (const position of ['left', 'right']) {
      const host = document.createElement('div')
      host.style.width = '320px'
      document.body.append(host)
      const carousel = new Carousel(host, Array.from({ length: 3 }, (_, index) => ({
        content: `<div style="height:180px">Slide ${index + 1}</div>`,
        thumb: `/demo-assets/panel-${index + 1}.svg`,
      })), { plugins: [createThumbnails({ position }), createControls()] })
      await new Promise(requestAnimationFrame)
      const viewport = host.querySelector('.carousel__viewport').getBoundingClientRect()
      const thumbs = host.querySelector('.carousel__thumbnails').getBoundingClientRect()
      const controls = host.querySelector('.carousel__controls').getBoundingClientRect()
      result.push({ below: controls.top >= Math.max(viewport.bottom, thumbs.bottom), counter: host.querySelector('.carousel__counter').textContent })
      carousel.destroy()
      host.remove()
    }
    return result
  })
  expect(geometry).toEqual([{ below: true, counter: '1 / 3' }, { below: true, counter: '1 / 3' }])
})

import { test, expect } from '@playwright/test'

test('demo works without third-party requests and supports dynamic mounting', async ({ page }) => {
  const errors = []
  const external = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1' && url.protocol !== 'data:') {
      external.push(url.href)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await expect(page.locator('#dynamic-status')).toHaveText('3 slides · selected 1')
  await page.locator('#demo-dynamic .carousel__slide:not([data-carousel-copy]) button').first().click()
  await expect(page.locator('#demo-dynamic').getByRole('button', { name: 'Clicked 1 times', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Add a slide', exact: true }).click()
  await expect(page.locator('#dynamic-status')).toHaveText('4 slides · selected 1')
  await page.getByRole('button', { name: 'Remove selected slide', exact: true }).click()
  await expect(page.locator('#dynamic-status')).toHaveText('3 slides · selected 1')
  await page.getByRole('button', { name: 'Destroy carousel', exact: true }).click()
  await expect(page.locator('#demo-dynamic .carousel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mount carousel', exact: true }).click()
  await expect(page.locator('#demo-dynamic .carousel')).toHaveCount(1)
  await expect(page.locator('#dynamic-status')).toHaveText('3 slides · selected 1')
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('auto-height responds to the demo controls and lazy content grows on navigation', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await expect(page.locator('#demo-height img').first()).toHaveJSProperty('complete', true)
  const viewport = page.locator('#demo-height .carousel__viewport')
  const height = () => viewport.evaluate(element => element.getBoundingClientRect().height)
  const initial = await height()
  await page.getByRole('button', { name: 'Narrow the carousel', exact: true }).click()
  await expect.poll(height).toBeLessThan(initial - 40)
  const narrow = await height()
  await page.getByRole('button', { name: 'Expand the caption', exact: true }).click()
  await expect.poll(height).toBeGreaterThan(narrow + 10)
  const status = page.locator('#lazy-status')
  await expect(status).toContainText('of 8 slides created')
  for (let index = 1; index < 8; index++) {
    await page.locator('#demo-lazy .carousel__dot').nth(index).click()
    await expect(page.locator('#demo-lazy .carousel__dot').nth(index)).toHaveAttribute('aria-current', 'page')
  }
  await expect(status).toHaveText('8 of 8 slides created')
  expect(errors).toEqual([])
})

test('the live demo previews built-in and application-defined reveal transitions', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#transitions-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const presets = page.getByRole('group', { name: 'Slide transition presets' })
  await expect(presets.getByRole('button')).toHaveCount(13)
  await page.getByLabel('Duration', { exact: true }).selectOption('400')
  const effects = [
    ['stairs', 'Stairs'], ['stairs-horizontal', 'Horizontal stairs'],
    ['pixel', 'Pixel'], ['curtain', 'Curtain'],
    ['diamond-wipe', 'Diamond wipe'], ['directional-wipe', 'Directional wipe'],
    ['clock-wipe', 'Clock wipe'], ['aperture-wipe', 'Aperture wipe'],
    ['polka-dots', 'Polka dots'], ['grid-flip', 'Grid flip'],
    ['doorway', 'Doorway'], ['water-drop', 'Water drop'], ['custom-iris', 'Custom iris'],
  ]
  for (const [index, [effect, label]] of effects.entries()) {
    await presets.getByRole('button', { name: label, exact: true }).click()
    await expect(presets.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
    const overlay = page.locator('#demo-transitions .carousel__transition')
    await expect(overlay).toHaveAttribute('data-transition', effect)
    await expect(overlay).toHaveCount(0)
    await expect(page.locator('#transition-status')).toHaveText(`${label} · slide ${(index + 1) % 6 + 1} of 6`)
    await expect(page.getByRole('link', { name: 'Link to this effect' })).toHaveAttribute('href', `?transition=${effect}#transitions-example`)
  }
  await page.getByLabel('Duration', { exact: true }).selectOption('400')
  await page.getByRole('region', { name: 'Reveal transitions example', exact: true })
    .getByRole('button', { name: 'Next slide', exact: true }).click()
  await expect(page.locator('#transition-status')).toHaveText('Custom iris · slide 3 of 6')
  expect(errors).toEqual([])
})

test('a direct effect link selects a working preset and its cover color can be themed', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?transition=water-drop#transitions-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await expect(page.getByRole('button', { name: 'Water drop', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#transition-status')).toHaveText('Water drop · slide 1 of 6')
  await page.getByLabel('Cover color', { exact: true }).fill('#a24076')
  await page.getByRole('region', { name: 'Reveal transitions example', exact: true })
    .getByRole('button', { name: 'Next slide', exact: true }).click()
  await expect(page.locator('#demo-transitions .carousel__transition-piece').first()).toHaveCSS('background-color', 'rgb(162, 64, 118)')
  await expect(page.locator('#transition-status')).toHaveText('Water drop · slide 2 of 6')
  expect(errors).toEqual([])
})

test('the live demo changes themes without remounting or losing the selected slide', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#theming-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const host = page.locator('#demo-theming')
  const presets = page.getByRole('group', { name: 'Carousel theme presets' })
  await expect(presets.getByRole('button')).toHaveCount(3)
  await page.evaluate(() => {
    window.demoThemingNodes = [...document.querySelectorAll('#demo-theming .carousel, #demo-theming .carousel__slide, #demo-theming .carousel__arrow')]
  })
  await host.getByRole('button', { name: 'Next slide', exact: true }).click()
  await expect(page.locator('#theme-status')).toHaveText('Light · slide 2 of 3')
  await presets.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(host).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('#theme-status')).toHaveText('Dark · slide 2 of 3')
  await expect(host).toHaveCSS('background-color', 'rgb(23, 27, 36)')
  await expect(host.locator('.carousel__arrow--next')).toHaveCSS('background-color', 'rgb(37, 45, 59)')
  await presets.getByRole('button', { name: 'Compact', exact: true }).click()
  await expect(page.locator('#theme-status')).toHaveText('Compact · slide 2 of 3')
  await expect(host.locator('.carousel__arrow--next')).toHaveCSS('width', '28px')
  await expect(host.locator('.carousel__thumb').first()).toHaveCSS('width', '44px')
  const sameNodes = await page.evaluate(() => {
    const current = [...document.querySelectorAll('#demo-theming .carousel, #demo-theming .carousel__slide, #demo-theming .carousel__arrow')]
    return current.length === window.demoThemingNodes.length && current.every((node, index) => node === window.demoThemingNodes[index])
  })
  expect(sameNodes).toBe(true)
  await page.setViewportSize({ width: 375, height: 900 })
  await expect(host.locator('.carousel__thumb').first()).toHaveCSS('width', '44px')
  expect(await host.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true)
  await presets.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('#theme-status')).toHaveText('Light · slide 2 of 3')
  await expect(host).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(errors).toEqual([])
})

test('the live demo reveals arrows over the slide and hides them after a mouse click and exit', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#hover-arrows-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const region = page.getByRole('region', { name: 'Auto-hiding arrows example', exact: true })
  const viewport = region.locator('.carousel__viewport')
  const previous = region.getByRole('button', { name: 'Previous slide', exact: true })
  const next = region.getByRole('button', { name: 'Next slide', exact: true })
  const status = page.locator('#hover-arrows-status')
  await status.hover()
  await expect(previous).toHaveCSS('opacity', '0')
  await expect(next).toHaveCSS('opacity', '0')
  await viewport.hover()
  await expect(previous).toHaveCSS('opacity', '1')
  await expect(next).toHaveCSS('opacity', '1')
  await next.click()
  await expect(status).toHaveText('Slide 2 of 3')
  await status.hover()
  await expect(previous).toHaveCSS('opacity', '0')
  await expect(next).toHaveCSS('opacity', '0')
  await viewport.hover()
  await previous.click()
  await expect(status).toHaveText('Slide 1 of 3')
  expect(errors).toEqual([])
})

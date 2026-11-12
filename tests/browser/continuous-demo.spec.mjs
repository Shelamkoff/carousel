import { test, expect } from '@playwright/test'

async function sampleMovement(slide, axis = 'x', duration = 240) {
  return slide.evaluate((element, { axis, duration }) => new Promise(resolve => {
    const samples = []
    const started = performance.now()
    function sample(now) {
      samples.push(element.getBoundingClientRect()[axis])
      if (now - started < duration) requestAnimationFrame(sample)
      else resolve({
        distance: samples.at(-1) - samples[0],
        range: Math.max(...samples) - Math.min(...samples),
        distinct: new Set(samples.map(value => value.toFixed(2))).size,
      })
    }
    requestAnimationFrame(sample)
  }), { axis, duration })
}

test('continuous demo glides, pauses and changes speed without remounting its cards', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#continuous-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const gallery = page.locator('#demo-continuous')
  const slide = gallery.locator('.carousel__slide:not([data-carousel-copy])').first()
  const status = page.locator('#continuous-status')
  await expect(status).toHaveText('Moving left · 40 px/s')
  const moving = await sampleMovement(slide)
  expect(moving.distance).toBeLessThan(-1)
  expect(moving.distinct).toBeGreaterThan(2)

  await gallery.locator('.carousel__viewport').hover()
  await expect(status).toHaveText('Paused · 40 px/s')
  expect((await sampleMovement(slide)).range).toBeLessThan(0.1)
  await page.getByLabel('Movement direction', { exact: true }).hover()
  await expect(status).toHaveText('Moving left · 40 px/s')

  await page.getByRole('button', { name: 'Pause scrolling', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume scrolling', exact: true })).toBeVisible()
  expect((await sampleMovement(slide)).range).toBeLessThan(0.1)
  await gallery.evaluate(host => {
    window.continuousDemoNodes = [...host.querySelectorAll('.carousel, .carousel__slide, .gallery-card')]
  })
  await page.getByLabel('Scroll speed', { exact: true }).selectOption('80')
  await page.getByLabel('Movement direction', { exact: true }).selectOption('right')
  await expect(status).toHaveText('Paused · 80 px/s')
  expect((await sampleMovement(slide)).range).toBeLessThan(0.1)
  expect(await gallery.evaluate(host => {
    const nodes = [...host.querySelectorAll('.carousel, .carousel__slide, .gallery-card')]
    return nodes.length === window.continuousDemoNodes.length
      && nodes.every((node, index) => node === window.continuousDemoNodes[index])
  })).toBe(true)

  await page.getByRole('button', { name: 'Resume scrolling', exact: true }).click()
  await expect(status).toHaveText('Moving right · 80 px/s')
  expect((await sampleMovement(slide)).distance).toBeGreaterThan(1)
  await gallery.locator('.carousel').focus()
  await expect(status).toHaveText('Paused · 80 px/s')
  expect((await sampleMovement(slide)).range).toBeLessThan(0.1)
  await page.getByLabel('Scroll speed', { exact: true }).focus()
  await expect(status).toHaveText('Moving right · 80 px/s')
  expect(errors).toEqual([])
})

test('continuous demo scrolls vertically on a narrow screen and preserves content', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/#continuous-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const gallery = page.locator('#demo-continuous')
  const slide = gallery.locator('.carousel__slide:not([data-carousel-copy])').first()
  await gallery.evaluate(host => {
    window.continuousDemoCards = [...host.querySelectorAll('.gallery-card')]
  })
  await page.getByLabel('Movement direction', { exact: true }).selectOption('up')
  await expect(gallery.locator('.carousel')).toHaveClass(/carousel--vertical/)
  await expect(gallery.locator('.carousel__viewport')).toHaveCSS('height', '360px')
  await expect(page.locator('#continuous-status')).toHaveText('Moving up · 40 px/s')
  expect((await sampleMovement(slide, 'y')).distance).toBeLessThan(-1)
  await page.getByLabel('Movement direction', { exact: true }).selectOption('down')
  await expect(page.locator('#continuous-status')).toHaveText('Moving down · 40 px/s')
  expect((await sampleMovement(slide, 'y')).distance).toBeGreaterThan(1)
  expect(await gallery.evaluate(host => {
    const cards = [...host.querySelectorAll('.gallery-card')]
    return cards.length === window.continuousDemoCards.length
      && cards.every((card, index) => card === window.continuousDemoCards[index])
  })).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Pause scrolling', exact: true }).click()
  expect((await sampleMovement(slide, 'y')).range).toBeLessThan(0.1)
  expect(errors).toEqual([])
})

test('continuous demo respects reduced motion and reacts when the preference changes', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#continuous-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const slide = page.locator('#demo-continuous .carousel__slide:not([data-carousel-copy])').first()
  await expect(page.locator('#continuous-status')).toHaveText('Paused for reduced motion · 40 px/s')
  await expect(page.locator('#continuous-motion-note')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause scrolling', exact: true })).toBeDisabled()
  expect((await sampleMovement(slide)).range).toBeLessThan(0.1)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('#continuous-status')).toHaveText('Moving left · 40 px/s')
  await expect(page.locator('#continuous-motion-note')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Pause scrolling', exact: true })).toBeEnabled()
  expect((await sampleMovement(slide)).distance).toBeLessThan(-1)
  expect(errors).toEqual([])
})

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

test('the live demo previews all three reveal transitions', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#transitions-example')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const presets = page.getByRole('group', { name: 'Slide transition presets' })
  await expect(presets.getByRole('button')).toHaveCount(3)
  const effects = ['stairs', 'pixel', 'curtain']
  for (const [index, effect] of effects.entries()) {
    const label = effect[0].toUpperCase() + effect.slice(1)
    await presets.getByRole('button', { name: label, exact: true }).click()
    await expect(presets.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
    const overlay = page.locator('#demo-transitions .carousel__transition')
    await expect(overlay).toHaveAttribute('data-transition', effect)
    await expect(overlay).toHaveCount(0)
    await expect(page.locator('#transition-status')).toHaveText(`${label} · slide ${index + 2} of 6`)
  }
  await page.getByLabel('Duration', { exact: true }).selectOption('400')
  await page.getByRole('region', { name: 'Reveal transitions example', exact: true })
    .getByRole('button', { name: 'Next slide', exact: true }).click()
  await expect(page.locator('#transition-status')).toHaveText('Curtain · slide 5 of 6')
  expect(errors).toEqual([])
})

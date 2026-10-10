import { test, expect } from '@playwright/test'

test('GitHub Pages entrypoint mounts all live examples', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await expect(page.locator('#demo-basic .carousel__slide')).toHaveCount(5)
  await expect(page.locator('#demo-fractional-loop .carousel__slide')).toHaveCount(6)

  const dots = page.locator('#demo-fractional-loop .carousel__dot')
  await expect(dots.nth(0)).toHaveAttribute('aria-current', 'page')
  await page.locator('#demo-fractional-loop .carousel__arrow--next').click()
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
})

test('keyboard plugin changes the current slide when focused', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await page.locator('#demo-basic .carousel').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#demo-basic .carousel__dot').nth(1))
    .toHaveAttribute('aria-current', 'page')
})

test('browser lifecycle regression suite passes', async ({ page }) => {
  await page.goto('/tests/browser/lifecycle.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await expect(page.locator('#result')).toContainText('"loopWrap":true')
})

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

test('fractional loop stays filled on mobile and after responsive resize', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')

  const viewport = page.locator('#demo-fractional-loop .carousel__viewport')
  const slides = viewport.locator('.carousel__slide')
  const assertFilled = async () => {
    const maxUncovered = await viewport.evaluate(element => {
      const container = element.getBoundingClientRect()
      const spans = [...element.querySelectorAll('.carousel__slide')]
        .map(slide => slide.getBoundingClientRect())
        .filter(rect => rect.right > container.left && rect.left < container.right)
        .sort((a, b) => a.left - b.left)
      let rightmost = container.left
      let gap = 0
      for (const span of spans) {
        gap = Math.max(gap, span.left - rightmost)
        rightmost = Math.max(rightmost, span.right)
      }
      return Math.max(gap, container.right - rightmost)
    })
    expect(maxUncovered).toBeLessThan(13) // Configured 12px slide gap.
  }

  await expect(slides).toHaveCount(3)
  await assertFilled()

  await page.setViewportSize({ width: 1100, height: 800 })
  await expect(slides).toHaveCount(6) // Inert slots fill the short fractional loop.
  await assertFilled()

  await page.locator('#demo-fractional-loop .carousel__arrow--next').click()
  await expect(page.locator('#demo-fractional-loop .carousel__dot').nth(1))
    .toHaveAttribute('aria-current', 'page')
})

test('browser lifecycle regression suite passes', async ({ page }) => {
  await page.goto('/tests/browser/lifecycle.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await expect(page.locator('#result')).toContainText('"loopWrap":true')
})

import { test, expect } from '@playwright/test'

test('swipe preserves ordinary clicks on links and buttons inside slides', async ({ page }) => {
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
    const link = document.createElement('a')
    link.id = 'audit-slide-link'
    link.href = '#audit-target'
    link.textContent = 'Slide link'
    const button = document.createElement('button')
    button.id = 'audit-slide-button'
    button.type = 'button'
    button.textContent = 'Slide button'
    window.__auditClicks = { link: 0, button: 0 }
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
  await page.evaluate(() => window.__auditCarousel.destroy())
  expect(errors).toEqual([])
})

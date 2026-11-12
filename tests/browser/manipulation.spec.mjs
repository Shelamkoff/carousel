import { test, expect } from '@playwright/test'

const cases = [
  'keyed reconciliation preserves focused nodes, values and selection',
  'fallback DOM moves restore focus without replacing controls',
  'point updates and refresh affect only the requested slide',
  'bulk replacement updates controls and preserves finite fallback selection',
  'short loops restore managed styles on originals and copies after rebuild',
  'effects receive frame progress for slide, fade and cover transitions',
  'parallax wrapping preserves native focus and custom element connections',
  'focus effects compose with parallax without duplicated descendant transforms',
  'custom layouts expose geometry and fail closed on invalid results',
  'effect failures cannot change core positioning or retain owned styles',
  'reentrant effects cannot apply a stale frame after collection replacement',
  'reduced motion removes positional effect displacement without removing state',
]
for (const name of cases) {
  test(name, async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    if (name.startsWith('reduced motion')) await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/__api__', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>` }))
    await page.goto('/__api__')
    await page.evaluate(async name => {
      const { scenarios } = await import('/tests/browser/api-cases.js')
      await scenarios[name]()
    }, name)
    expect(errors).toEqual([])
  })
}

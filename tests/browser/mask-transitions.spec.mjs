import { test, expect } from '@playwright/test'

const names = ['diamond-wipe', 'directional-wipe', 'clock-wipe', 'aperture-wipe', 'polka-dots']

test.use({ viewport: { width: 1500, height: 1100 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/__mask_transitions__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body style="margin: 0"></body></html>',
  }))
  await page.goto('/__mask_transitions__')
})

for (const name of names) {
  test(`${name} covers the rendered viewport without seams in both directions`, async ({ page }) => {
    const result = await page.evaluate(async name => {
      const { ViewportTransition } = await import('/src/transitions/ViewportTransition.js')
      const { maskTransitionPresets } = await import('/src/transitions/masks.js')
      const cases = []
      for (const [width, height, scale] of [[1200.75, 133.5, 1], [173.5, 901.25, 1], [331.25, 331.25, 1], [600.5, 320.25, 0.7]]) {
        for (const backwards of [false, true]) {
          const viewport = document.createElement('div')
          Object.assign(viewport.style, {
            position: 'relative', width: `${width}px`, height: `${height}px`,
            margin: '20px', background: 'rgb(220, 230, 240)',
            transform: `scale(${scale})`, transformOrigin: '0 0',
          })
          viewport.style.setProperty('--carousel-transition-color', 'rgb(12, 34, 56)')
          document.body.appendChild(viewport)
          const driver = new ViewportTransition(viewport, maskTransitionPresets[name], backwards)
          driver.initialize()
          const overlay = viewport.firstElementChild
          const initial = {
            hidden: overlay.getAttribute('aria-hidden'), inert: overlay.inert,
            clipped: [...overlay.querySelectorAll('.carousel__transition-piece')].every(piece => (
              getComputedStyle(piece).opacity === '0' || piece.getBoundingClientRect().width === 0
            )),
          }
          // Native hit testing observes clip paths and round corners. Temporarily
          // enable it only on the decorative test layer to detect a real hole.
          overlay.inert = false
          overlay.style.pointerEvents = 'auto'
          driver.render(0.5)
          const rect = viewport.getBoundingClientRect()
          const missed = []
          for (const x of [0.5, width / 4, width / 2, width * 3 / 4, width - 0.5]) {
            for (const y of [0.5, height / 4, height / 2, height * 3 / 4, height - 0.5]) {
              const hit = document.elementFromPoint(rect.left + x * scale, rect.top + y * scale)
              if (!hit?.closest('.carousel__transition-piece')) missed.push([x, y])
            }
          }
          const pieces = [...overlay.querySelectorAll('.carousel__transition-piece')]
          const colors = pieces.map(piece => getComputedStyle(piece).backgroundColor)
          driver.render(1)
          const clearAtEnd = pieces.every(piece => getComputedStyle(piece).opacity === '0' || piece.getBoundingClientRect().width === 0)
          driver.destroy()
          cases.push({ width, height, scale, backwards, initial, missed, colors, clearAtEnd, remaining: viewport.childElementCount })
          viewport.remove()
        }
      }
      return cases
    }, name)
    expect(result).toHaveLength(8)
    for (const scenario of result) {
      expect(scenario.initial).toEqual({ hidden: 'true', inert: true, clipped: true })
      expect(scenario.missed, JSON.stringify(scenario)).toEqual([])
      expect(scenario.colors.every(color => color === 'rgb(12, 34, 56)')).toBe(true)
      expect(scenario.clearAtEnd).toBe(true)
      expect(scenario.remaining).toBe(0)
    }
  })
}

test('aperture has a real transparent rotating hole and clock sweeps a real half-plane', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { ViewportTransition } = await import('/src/transitions/ViewportTransition.js')
    const { maskTransitionPresets } = await import('/src/transitions/masks.js')
    const viewport = document.createElement('div')
    Object.assign(viewport.style, { position: 'relative', width: '400px', height: '400px', margin: '20px' })
    document.body.appendChild(viewport)
    const results = []
    for (const name of ['aperture-wipe', 'clock-wipe']) {
      for (const backwards of [false, true]) {
        const driver = new ViewportTransition(viewport, maskTransitionPresets[name], backwards)
        driver.initialize()
        const overlay = viewport.firstElementChild
        overlay.inert = false
        overlay.style.pointerEvents = 'auto'
        driver.render(0.25)
        const piece = overlay.firstElementChild
        const rect = viewport.getBoundingClientRect()
        const covered = (x, y) => Boolean(document.elementFromPoint(rect.left + x, rect.top + y)?.closest('.carousel__transition-piece'))
        results.push({
          name, backwards, supported: CSS.supports('clip-path', piece.style.clipPath),
          center: covered(200, 200), corner: covered(4, 4),
          left: covered(100, 200), right: covered(300, 200),
        })
        driver.destroy()
      }
    }
    viewport.remove()
    return results
  })
  for (const effect of result) {
    expect(effect.supported).toBe(true)
    if (effect.name === 'aperture-wipe') {
      expect(effect.center).toBe(false)
      expect(effect.corner).toBe(true)
    } else {
      expect(effect.left).toBe(effect.backwards)
      expect(effect.right).toBe(!effect.backwards)
    }
  }
})

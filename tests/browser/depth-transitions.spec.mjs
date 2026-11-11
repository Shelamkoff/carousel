import { test, expect } from '@playwright/test'

const names = ['grid-flip', 'doorway', 'water-drop']

test.use({ viewport: { width: 1500, height: 1100 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/__depth_transitions__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body style="margin: 0"></body></html>',
  }))
  await page.goto('/__depth_transitions__')
})

for (const name of names) {
  test(`${name} renders its geometry and fully covers fractional and scaled viewports`, async ({ page }) => {
    const result = await page.evaluate(async name => {
      const { ViewportTransition } = await import('/src/transitions/ViewportTransition.js')
      const { depthTransitionPresets } = await import('/src/transitions/depth.js')
      const cases = []
      for (const [width, height, scale] of [[1200.75, 133.5, 1], [173.5, 901.25, 1], [600.5, 320.25, 0.4]]) {
        for (const backwards of [false, true]) {
          const viewport = document.createElement('div')
          Object.assign(viewport.style, {
            position: 'relative', width: `${width}px`, height: `${height}px`,
            margin: '20px', transform: `scale(${scale})`, transformOrigin: '0 0',
          })
          viewport.style.setProperty('--carousel-transition-color', 'rgb(12, 34, 56)')
          viewport.style.setProperty('--carousel-transition-highlight', 'rgb(98, 76, 54)')
          document.body.appendChild(viewport)
          const driver = new ViewportTransition(viewport, depthTransitionPresets[name], backwards)
          driver.initialize()
          const overlay = viewport.firstElementChild
          const pieces = [...overlay.querySelectorAll('.carousel__transition-piece')]
          const clear = () => pieces.every(piece => Number(getComputedStyle(piece).opacity) < 1e-12)
          const initial = { inert: overlay.inert, hidden: overlay.getAttribute('aria-hidden'), clear: clear() }
          driver.render(0.25)
          const matrix = new DOMMatrixReadOnly(getComputedStyle(pieces[0]).transform)
          const intermediate = {
            is2D: matrix.is2D, m11: matrix.m11, m13: matrix.m13,
            visible: Number(getComputedStyle(pieces[0]).opacity) > 0,
            waves: name === 'water-drop' ? pieces.slice(1).map(piece => ({
              transform: getComputedStyle(piece).transform,
              opacity: Number(getComputedStyle(piece).opacity),
            })) : [],
          }
          // Native hit testing sees the actual rotated faces and circular edge.
          // Transparent ripple decorations must not conceal a gap in the disk.
          overlay.inert = false
          overlay.style.pointerEvents = 'auto'
          if (name === 'water-drop') pieces.slice(1).forEach(piece => { piece.style.pointerEvents = 'none' })
          driver.render(0.5)
          const rect = viewport.getBoundingClientRect()
          const missed = []
          for (const x of [0.5, width / 8, width / 4, width / 2, width * 7 / 8, width - 0.5]) {
            for (const y of [0.5, height / 4, height / 2, height * 3 / 4, height - 0.5]) {
              const hit = document.elementFromPoint(rect.left + x * scale, rect.top + y * scale)
              if (!hit?.closest('.carousel__transition-piece')) missed.push([x, y])
            }
          }
          const diskRect = pieces[0].getBoundingClientRect()
          const color = getComputedStyle(pieces[0]).backgroundColor
          const radius = getComputedStyle(pieces[0]).borderTopLeftRadius
          driver.render(1)
          const clearAtEnd = clear()
          driver.destroy()
          cases.push({
            width, height, scale, backwards, initial, intermediate, missed, color, radius,
            diskWidth: diskRect.width, diskHeight: diskRect.height,
            clearAtEnd, remaining: viewport.childElementCount,
          })
          viewport.remove()
        }
      }
      return cases
    }, name)
    expect(result).toHaveLength(6)
    for (const scenario of result) {
      expect(scenario.initial).toEqual({ inert: true, hidden: 'true', clear: true })
      expect(scenario.intermediate.visible).toBe(true)
      expect(scenario.missed, JSON.stringify(scenario)).toEqual([])
      expect(scenario.color).toBe('rgb(12, 34, 56)')
      expect(scenario.clearAtEnd).toBe(true)
      expect(scenario.remaining).toBe(0)
      if (name === 'water-drop') {
        expect(scenario.radius).toBe('50%')
        expect(scenario.diskWidth).toBeCloseTo(scenario.diskHeight, 3)
        expect(new Set(scenario.intermediate.waves.map(wave => wave.transform)).size).toBe(3)
        expect(scenario.intermediate.waves.every(wave => wave.opacity > 0)).toBe(true)
      } else {
        expect(scenario.intermediate.is2D).toBe(false)
        expect(Math.abs(scenario.intermediate.m13)).toBeGreaterThan(0.01)
        expect(scenario.intermediate.m11).toBeGreaterThan(0)
        expect(scenario.intermediate.m11).toBeLessThan(1)
      }
    }
    if (name !== 'water-drop') {
      for (let index = 0; index < result.length; index += 2) {
        expect(Math.sign(result[index].intermediate.m13)).toBe(-Math.sign(result[index + 1].intermediate.m13))
      }
    }
  })
}

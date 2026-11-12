import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__physical_geometry__', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__physical_geometry__')
})

for (const orientation of ['horizontal', 'vertical']) {
  test(`${orientation} physical measurements match painted cards before and after responsive resize`, async ({ page }) => {
    await page.evaluate(async orientation => {
      const { Carousel } = await import('/src/index.js')
      const host = document.createElement('div')
      host.style.width = '400px'
      document.body.append(host)
      let calls = 0
      const geometry = { name: 'responsive-cards', measure({ viewportSize, slides, gap }) {
        calls++
        let offset = 0
        const measured = slides.map(slide => {
          const size = viewportSize * slide.meta.ratio
          const result = { offset, size }; offset += size + gap; return result
        })
        return { slides: measured }
      } }
      const carousel = new Carousel(host, [.35, .8, .55, .7, .4].map((ratio, id) => ({ id,
        meta: { ratio }, content: `<article style="min-height:110px;background:#ddd"><input value="Slide ${id}"></article>`,
      })), { geometry, orientation, viewportHeight: 300, gap: 12, transitionDuration: 0 })
      const originals = carousel.getSlideElements()
      window.physical = { carousel, host, originals, calls: () => calls,
        inspect() {
          const viewport = host.querySelector('.carousel__viewport').getBoundingClientRect()
          const start = orientation === 'vertical' ? 'top' : 'left'
          const size = orientation === 'vertical' ? 'height' : 'width'
          return carousel.getRenderState().slides.map(slot => {
            const bounds = slot.element.getBoundingClientRect()
            return { offset: slot.offset, actualOffset: bounds[start] - viewport[start],
              size: slot.size, actualSize: bounds[size] }
          })
        },
      }
      carousel.goTo(4)
    }, orientation)
    const initial = await page.evaluate(() => ({
      slots: physical.inspect(), index: physical.carousel.getIndex(),
      end: physical.carousel.getNavigationGeometry().lastIndex, calls: physical.calls(),
    }))
    expect(initial.index).toBe(initial.end)
    expect(initial.calls).toBe(1)
    for (const slot of initial.slots) {
      expect(slot.actualOffset).toBeCloseTo(slot.offset, 1)
      expect(slot.actualSize).toBeCloseTo(slot.size, 1)
    }
    await page.evaluate(orientation => {
      if (orientation === 'horizontal') physical.host.style.width = '280px'
      else physical.host.querySelector('.carousel__viewport').style.height = '220px'
    }, orientation)
    await expect.poll(() => page.evaluate(() => physical.calls())).toBe(2)
    const resized = await page.evaluate(() => ({
      slots: physical.inspect(), index: physical.carousel.getIndex(),
      end: physical.carousel.getNavigationGeometry().lastIndex,
      retained: physical.originals.every((element, index) => element === physical.carousel.getSlideElement(index)),
    }))
    expect(resized.index).toBe(Math.min(initial.index, resized.end))
    expect(resized.retained).toBe(true)
    for (const slot of resized.slots) {
      expect(slot.actualOffset).toBeCloseTo(slot.offset, 1)
      expect(slot.actualSize).toBeCloseTo(slot.size, 1)
    }
    await page.evaluate(() => physical.carousel.destroy())
  })
}

test('a short physical cycle covers the viewport and keeps its most visible occurrence interactive', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div'); host.style.width = '520px'; document.body.append(host)
    const probe = { name: 'physical-drag', install(ctx) { this.ctx = ctx } }
    const carousel = new Carousel(host, [0, 1].map(id => ({ id,
      content: `<button style="height:100px;width:100%">Card ${id}</button>`,
    })), { loop: true, transitionDuration: 0, plugins: [probe], geometry: {
      name: 'short-cycle', measure() {
        return { slides: [{ offset: 0, size: 80 }, { offset: 80, size: 120 }], loopLength: 200 }
      },
    } })
    try {
      const snapshots = []
      for (const position of [-230, -20, 0, 50, 170, 240, 430]) {
        probe.ctx.setPositionDrag(position)
        const frame = carousel.getRenderState()
        const visible = frame.slides.filter(slot => slot.visible > 0).sort((a, b) => a.offset - b.offset)
        snapshots.push({
          filled: visible[0].offset <= 0 && visible.at(-1).offset + visible.at(-1).size >= 520
            && visible.slice(1).every((slot, i) => Math.abs(slot.offset - visible[i].offset - visible[i].size) < .01),
          interactive: [0, 1].every(index => {
            const group = frame.slides.filter(slot => slot.index === index)
            const original = group.find(slot => !slot.isCopy)
            const overlap = slot => slot.visible * slot.size
            return overlap(original) >= Math.max(...group.map(overlap)) - .01
              && !original.element.inert && group.filter(slot => slot.isCopy).every(slot => slot.element.inert)
          }),
        })
      }
      return snapshots
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual(Array(7).fill({ filled: true, interactive: true }))
})

for (const hook of ['measure', 'error']) {
  test(`point content update from geometry ${hook} during resize preserves the new measurement`, async ({ page }) => {
    const result = await page.evaluate(async hook => {
      const { Carousel } = await import('/src/index.js')
      const host = document.createElement('div')
      host.style.width = '200px'
      document.body.append(host)
      let carousel, reenter = false, calls = 0, errors = 0
      const geometry = { name: 'responsive', measure({ viewportSize, count }) {
        calls++
        if (reenter) {
          reenter = false
          if (hook === 'error') throw new Error('resize measurement failed')
          carousel.updateSlide(0, { content: '<article>Latest content</article>' })
        }
        return { slides: Array.from({ length: count }, (_, index) => ({
          offset: index * viewportSize / 2, size: viewportSize / 2,
        })), maxPosition: (count - 1) * viewportSize / 2 }
      } }
      carousel = new Carousel(host, [0, 1, 2].map(id => ({ id,
        content: `<article style="height:80px">${id}</article>`,
      })), { geometry, transitionDuration: 0 })
      carousel.on('geometry:error', () => {
        errors++
        carousel.updateSlide(0, { content: '<article>Latest content</article>' })
      })
      try {
        carousel.goTo(1)
        await new Promise(requestAnimationFrame)
        reenter = true
        host.style.width = '400px'
        for (let index = 0; index < 8; index++) await new Promise(requestAnimationFrame)
        return { width: host.clientWidth, modelViewport: carousel.getNavigationGeometry().viewportSize,
          uniform: carousel.getNavigationGeometry().uniform,
          renderedViewport: carousel.getRenderState().viewportSize, calls, errors,
          index: carousel.getIndex(), text: carousel.getSlideElement(0).textContent,
          widths: carousel.getSlideElements().map(node => node.style.width) }
      } finally { carousel.destroy(); host.remove() }
    }, hook)
    expect(result.modelViewport).toBe(result.width)
    expect(result.renderedViewport).toBe(result.width)
    expect(result.uniform).toBe(hook === 'error')
    expect(result.widths).toEqual(Array(3).fill(hook === 'error' ? '400px' : '200px'))
    expect(result.text).toBe('Latest content')
    expect(result.index).toBe(1)
    expect(result.errors).toBe(hook === 'error' ? 1 : 0)
  })
}

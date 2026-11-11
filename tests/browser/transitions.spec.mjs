import { test, expect } from '@playwright/test'

const transitions = [
  'stairs', 'stairs-horizontal', 'pixel', 'curtain',
  'diamond-wipe', 'directional-wipe', 'clock-wipe', 'aperture-wipe',
  'polka-dots', 'grid-flip', 'doorway', 'water-drop',
]

async function mount(page, transition, options = {}) {
  await page.evaluate(async ({ transition, options }) => {
    const { Carousel, createSwipe } = await import('/src/index.js')
    const host = document.createElement('form')
    host.style.width = '600px'
    document.body.append(host)
    let connections = 0
    customElements.define('transition-probe', class extends HTMLElement {
      connectedCallback() { connections++ }
    })
    const { count = 5, swipe = false, ...carouselOptions } = options
    const contents = Array.from({ length: count }, (_, index) => {
      const content = document.createElement('article')
      content.style.height = '140px'
      const input = document.createElement('input')
      input.id = `transition-input-${index}`
      input.name = `slide-${index}`
      input.value = `value-${index}`
      input.required = true
      const custom = document.createElement('transition-probe')
      custom.textContent = `Slide ${index + 1}`
      content.append(input, custom)
      return content
    })
    let context
    const carousel = new Carousel(host, contents.map(content => ({ content: () => content })), {
      transition,
      transitionDuration: 180,
      ...carouselOptions,
      plugins: [
        ...(swipe ? [createSwipe({ mouse: true })] : []),
        { name: 'transition-probe', install(ctx) { context = ctx } },
      ],
    })
    context.getRoot().style.setProperty('--carousel-transition-color', 'rgb(12, 34, 56)')
    const events = []
    carousel.on('slide:beforeChange', ({ fromIndex, toIndex }) => events.push(['before', fromIndex, toIndex]))
    carousel.on('transition:start', ({ fromIndex, toIndex }) => events.push(['start', fromIndex, toIndex]))
    carousel.on('transition:end', ({ index }) => events.push(['end', index]))
    carousel.on('slide:change', ({ prevIndex, index }) => events.push(['change', prevIndex, index]))
    window.transitionTest = { carousel, context, host, contents, events, connections: () => connections }
  }, { transition, options })
}

test.beforeEach(async ({ page }) => {
  await page.route('**/__transitions__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/node_modules/@shelamkoff/event-bus/dist/index.js"}}</script>
      </head><body></body></html>`,
  }))
  await page.goto('/__transitions__')
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.transitionTest?.carousel.destroy())
})

for (const transition of transitions) {
  test(`${transition} completes once and preserves live content and form values`, async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await mount(page, transition)
    const result = await page.evaluate(async () => {
      const { carousel, context, host, contents, events, connections } = window.transitionTest
      const initialConnections = connections()
      const initialValues = [...new FormData(host)]
      const done = new Promise(resolve => carousel.once('transition:end', resolve))
      carousel.next()
      const overlay = host.querySelector('.carousel__transition')
      const during = {
        variant: overlay?.dataset.transition,
        hidden: overlay?.getAttribute('aria-hidden'),
        inert: overlay?.inert,
        pieces: overlay?.querySelectorAll('.carousel__transition-piece').length,
        color: overlay?.firstElementChild ? getComputedStyle(overlay.firstElementChild).backgroundColor : null,
        pointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : null,
        index: carousel.getIndex(),
        values: [...new FormData(host)],
        valid: host.checkValidity(),
        ids: host.querySelectorAll('[id]').length,
        connections: connections(),
      }
      await done
      return {
        during, initialValues, initialConnections,
        index: carousel.getIndex(), events,
        overlays: host.querySelectorAll('.carousel__transition').length,
        sameContent: context.getSlideElements().every((slide, index) => slide.firstChild === contents[index]),
        values: [...new FormData(host)],
        connections: connections(),
      }
    })
    expect(result.during.variant).toBe(transition)
    expect(result.during.hidden).toBe('true')
    expect(result.during.inert).toBe(true)
    expect(result.during.pieces).toBeGreaterThan(0)
    expect(result.during.pieces).toBeLessThanOrEqual(64)
    expect(result.during.color).toBe('rgb(12, 34, 56)')
    expect(result.during.pointerEvents).toBe('none')
    expect(result.during.index).toBe(0)
    expect(result.during.values).toEqual(result.initialValues)
    expect(result.during.valid).toBe(true)
    expect(result.during.ids).toBe(5)
    expect(result.during.connections).toBe(result.initialConnections)
    expect(result.index).toBe(1)
    expect(result.events).toEqual([['before', 0, 1], ['start', 0, 1], ['end', 1], ['change', 0, 1]])
    expect(result.overlays).toBe(0)
    expect(result.sameContent).toBe(true)
    expect(result.values).toEqual(result.initialValues)
    expect(result.connections).toBe(result.initialConnections)
    expect(errors).toEqual([])
  })

  test(`${transition} wraps a fractional short loop without leaving visible gaps`, async ({ page }) => {
    await mount(page, transition, { count: 3, loop: true, slidesPerView: 2.5, startIndex: 2, gap: 12 })
    const result = await page.evaluate(async () => {
      const { carousel, context, host, connections } = window.transitionTest
      const initialConnections = connections()
      const done = new Promise(resolve => carousel.once('transition:end', resolve))
      carousel.next()
      await done
      const viewport = context.getViewport().getBoundingClientRect()
      const spans = context.getVisualElements().map(slide => slide.getBoundingClientRect())
        .filter(rect => rect.right > viewport.left && rect.left < viewport.right)
        .sort((a, b) => a.left - b.left)
      let rightmost = viewport.left
      let largestGap = 0
      for (const span of spans) {
        largestGap = Math.max(largestGap, span.left - rightmost)
        rightmost = Math.max(rightmost, span.right)
      }
      return {
        index: carousel.getIndex(),
        largestGap: Math.max(largestGap, viewport.right - rightmost),
        originals: context.getSlideElements().length,
        visuals: context.getVisualElements().length,
        overlays: host.querySelectorAll('.carousel__transition').length,
        connections: connections(), initialConnections,
        values: [...new FormData(host)],
      }
    })
    expect(result.index).toBe(0)
    expect(result.largestGap).toBeLessThan(13)
    expect(result.originals).toBe(3)
    expect(result.visuals).toBe(6)
    expect(result.overlays).toBe(0)
    expect(result.connections).toBe(result.initialConnections)
    expect(result.values).toEqual([['slide-0', 'value-0'], ['slide-1', 'value-1'], ['slide-2', 'value-2']])
  })

  test(`${transition} respects reduced motion and completes synchronously`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount(page, transition, { transitionDuration: 900 })
    const result = await page.evaluate(() => {
      const { carousel, host, events } = window.transitionTest
      carousel.next()
      return { index: carousel.getIndex(), overlays: host.querySelectorAll('.carousel__transition').length, events }
    })
    expect(result).toEqual({
      index: 1, overlays: 0,
      events: [['before', 0, 1], ['start', 0, 1], ['end', 1], ['change', 0, 1]],
    })
  })

  test(`${transition} settles at the requested slide when the viewport resizes`, async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await mount(page, transition, { transitionDuration: 320 })
    const result = await page.evaluate(async () => {
      const { carousel, context, host, events } = window.transitionTest
      const done = new Promise(resolve => carousel.once('transition:end', resolve))
      carousel.goTo(2)
      host.style.width = '320px'
      await done
      for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
      return {
        index: carousel.getIndex(),
        widths: context.getSlideElements().map(slide => slide.offsetWidth),
        position: context.getPosition(),
        step: context.getStep(),
        overlays: host.querySelectorAll('.carousel__transition').length,
        completed: events.filter(event => event[0] === 'end' || event[0] === 'change'),
      }
    })
    expect(result.index).toBe(2)
    expect(result.widths).toEqual([320, 320, 320, 320, 320])
    expect(result.position).toBeCloseTo(2 * result.step, 4)
    expect(result.overlays).toBe(0)
    expect(result.completed).toEqual([['end', 2], ['change', 0, 2]])
    expect(errors).toEqual([])
  })

  test(`${transition} cancellation by update and destroy removes overlays and stale completion`, async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await mount(page, transition, { transitionDuration: 180 })
    const result = await page.evaluate(async () => {
      const { carousel, host, events } = window.transitionTest
      carousel.next()
      carousel.update({ gap: 8 })
      const afterUpdate = host.querySelectorAll('.carousel__transition').length
      await new Promise(resolve => setTimeout(resolve, 260))
      const completionsAfterUpdate = events.filter(event => event[0] === 'end' || event[0] === 'change')
      carousel.goTo(3)
      const activeBeforeDestroy = host.querySelectorAll('.carousel__transition').length
      carousel.destroy()
      const afterDestroy = host.childElementCount
      await new Promise(resolve => setTimeout(resolve, 260))
      return {
        afterUpdate, completionsAfterUpdate, activeBeforeDestroy, afterDestroy,
        completionsAfterDestroy: events.filter(event => event[0] === 'end' || event[0] === 'change'),
        leftoverOverlays: document.querySelectorAll('.carousel__transition').length,
      }
    })
    expect(result).toEqual({
      afterUpdate: 0, completionsAfterUpdate: [], activeBeforeDestroy: 1,
      afterDestroy: 0, completionsAfterDestroy: [], leftoverOverlays: 0,
    })
    expect(errors).toEqual([])
  })
}

test('a real pointer drag takes over an active cover transition without stale completion', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mount(page, 'pixel', { swipe: true, transitionDuration: 1500 })
  const viewport = page.locator('.carousel__viewport')
  const bounds = await viewport.boundingBox()
  const x = bounds.x + bounds.width * 0.75
  const y = bounds.y + bounds.height * 0.75
  await page.mouse.move(x, y)
  await page.evaluate(() => window.transitionTest.carousel.goTo(2))
  await expect(page.locator('.carousel__transition')).toHaveCount(1)
  await page.mouse.down()
  const origin = await page.evaluate(() => window.transitionTest.carousel.getIndex())
  await expect(page.locator('.carousel__transition')).toHaveCount(0)
  await page.mouse.move(x - 100, y, { steps: 4 })
  await page.mouse.up()
  const destination = origin + 1
  await expect.poll(() => page.evaluate(() => {
    return window.transitionTest.events.filter(event => event[0] === 'end')
  })).toEqual([['end', destination]])
  const result = await page.evaluate(() => {
    const { carousel, context, host, events } = window.transitionTest
    return {
      index: carousel.getIndex(), position: context.getPosition(), step: context.getStep(),
      overlays: host.querySelectorAll('.carousel__transition').length,
      changes: events.filter(event => event[0] === 'change'),
    }
  })
  expect(result.index).toBe(destination)
  expect(result.position).toBeCloseTo(destination * result.step, 4)
  expect(result.overlays).toBe(0)
  expect(result.changes).toEqual([['change', origin, destination]])
  expect(errors).toEqual([])
})

test('horizontal stairs cover fractional viewport rows without seams and alternate their travel direction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { ViewportTransition } = await import('/src/transitions/ViewportTransition.js')
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:relative;overflow:hidden;width:501.5px;height:193.3px;--carousel-transition-color:rgb(23,45,67)'
    document.body.append(viewport)
    const snapshots = []
    try {
      for (const backwards of [false, true]) {
        const transition = new ViewportTransition(viewport, 'stairs-horizontal', backwards)
        transition.initialize()
        const overlay = viewport.querySelector('.carousel__transition')
        const snapshot = progress => {
          transition.render(progress)
          const bounds = viewport.getBoundingClientRect()
          return [...overlay.children].map(piece => {
            const rect = piece.getBoundingClientRect()
            const style = getComputedStyle(piece)
            const matrix = new DOMMatrix(style.transform)
            return {
              left: rect.left - bounds.left, right: rect.right - bounds.left,
              top: rect.top - bounds.top, bottom: rect.bottom - bounds.top,
              width: rect.width, height: rect.height,
              x: matrix.m41, y: matrix.m42, opacity: style.opacity, color: style.backgroundColor,
            }
          })
        }
        snapshots.push({ backwards, initial: snapshot(0), entering: snapshot(0.17), covered: snapshot(0.5), final: snapshot(1) })
        transition.destroy()
      }
      return {
        snapshots,
        width: viewport.getBoundingClientRect().width,
        height: viewport.getBoundingClientRect().height,
        leftovers: viewport.childElementCount,
      }
    } finally {
      viewport.remove()
    }
  })
  expect(result.leftovers).toBe(0)
  for (const snapshot of result.snapshots) {
    expect(snapshot.covered).toHaveLength(8)
    let bottom = 0
    for (let index = 0; index < 8; index++) {
      const row = snapshot.covered[index]
      expect(row.top).toBeCloseTo(index * result.height / 8, 1)
      expect(row.top).toBeLessThanOrEqual(bottom + 0.1)
      expect(row.left).toBeLessThanOrEqual(0.1)
      expect(row.right).toBeGreaterThanOrEqual(result.width)
      expect(row.height).toBeGreaterThanOrEqual(result.height / 8)
      expect(row.height).toBeLessThan(result.height / 8 + 1)
      expect(row.y).toBe(0)
      expect(row.opacity).toBe('1')
      expect(row.color).toBe('rgb(23, 45, 67)')
      bottom = row.bottom
      const initial = snapshot.initial[index]
      const final = snapshot.final[index]
      expect(initial.top).toBeCloseTo(row.top, 1)
      expect(final.top).toBeCloseTo(row.top, 1)
      if (index % 2 === 0) {
        expect(initial.right).toBeLessThanOrEqual(0.1)
        expect(final.left).toBeGreaterThanOrEqual(result.width)
      } else {
        expect(initial.left).toBeGreaterThanOrEqual(result.width)
        expect(final.right).toBeLessThanOrEqual(0.1)
      }
    }
    expect(bottom).toBeGreaterThanOrEqual(result.height)
  }
  const [forward, backward] = result.snapshots
  expect(Math.abs(forward.entering[0].x)).toBeLessThan(Math.abs(forward.entering[7].x))
  expect(Math.abs(backward.entering[0].x)).toBeGreaterThan(Math.abs(backward.entering[7].x))
  for (let index = 0; index < 8; index++) {
    expect(Math.abs(backward.entering[index].x)).toBeCloseTo(Math.abs(forward.entering[7 - index].x), 3)
  }
})

async function mountCustom(page, options = {}) {
  await mount(page, 'slide', options)
  await page.evaluate(() => {
    const { carousel, context } = window.transitionTest
    const instances = []
    const definition = {
      name: 'application-wipe',
      create(factoryContext) {
        const { container, direction } = factoryContext
        const containerBounds = container.getBoundingClientRect()
        const viewportBounds = context.getViewport().getBoundingClientRect()
        const panel = container.ownerDocument.createElement('div')
        panel.className = 'application-transition-panel'
        panel.style.cssText = 'position:absolute;inset:0;background:var(--carousel-transition-color);opacity:0'
        container.append(panel)
        const record = {
          container, direction, frames: [], destroyed: 0, covered: false,
          factoryConnected: container.isConnected,
          factorySize: { width: containerBounds.width, height: containerBounds.height },
          viewportSize: { width: viewportBounds.width, height: viewportBounds.height },
          contextFrozen: Object.isFrozen(factoryContext),
        }
        instances.push(record)
        return {
          render(progress) {
            panel.style.opacity = String(1 - Math.abs(progress * 2 - 1))
            record.frames.push({ progress, index: carousel.getIndex() })
            if (progress === 0.5) {
              const bounds = context.getViewport().getBoundingClientRect()
              const rect = panel.getBoundingClientRect()
              record.covered = rect.left <= bounds.left && rect.top <= bounds.top
                && rect.right >= bounds.right && rect.bottom >= bounds.bottom
                && getComputedStyle(panel).opacity === '1'
            }
          },
          destroy() { record.destroyed++ },
        }
      },
    }
    window.customTransitionTest = { definition, instances }
    carousel.update({ transition: definition })
  })
}

test('a public custom transition receives the core timeline and a fresh instance for each direction', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mountCustom(page, { count: 3, loop: true, slidesPerView: 2.5, gap: 12 })
  const result = await page.evaluate(async () => {
    const { carousel, context, host, contents, events, connections } = window.transitionTest
    const { instances } = window.customTransitionTest
    const values = [...new FormData(host)]
    const initialConnections = connections()
    const during = []
    for (const action of ['next', 'prev']) {
      const done = new Promise(resolve => carousel.once('transition:end', resolve))
      carousel[action]()
      const overlay = host.querySelector('.carousel__transition')
      during.push({
        name: overlay.dataset.transition,
        inert: overlay.inert,
        hidden: overlay.getAttribute('aria-hidden'),
        pointerEvents: getComputedStyle(overlay).pointerEvents,
        panelCount: overlay.querySelectorAll('.application-transition-panel').length,
      })
      await done
    }
    return {
      during,
      records: instances.map(record => ({
        direction: record.direction, frames: record.frames, destroyed: record.destroyed,
        covered: record.covered, connected: record.container.isConnected,
        factoryConnected: record.factoryConnected, factorySize: record.factorySize,
        viewportSize: record.viewportSize, contextFrozen: record.contextFrozen,
      })),
      index: carousel.getIndex(), events,
      values, finalValues: [...new FormData(host)],
      initialConnections, finalConnections: connections(),
      sameContent: context.getSlideElements().every((slide, index) => slide.firstChild === contents[index]),
      overlays: host.querySelectorAll('.carousel__transition').length,
    }
  })
  expect(result.during).toEqual(Array.from({ length: 2 }, () => ({
    name: 'application-wipe', inert: true, hidden: 'true', pointerEvents: 'none', panelCount: 1,
  })))
  expect(result.records).toHaveLength(2)
  for (const [index, record] of result.records.entries()) {
    const from = index === 0 ? 0 : 1
    const to = index === 0 ? 1 : 0
    expect(record.direction).toBe(index === 0 ? 1 : -1)
    expect(record.factoryConnected).toBe(true)
    expect(record.contextFrozen).toBe(true)
    expect(record.factorySize).toEqual(record.viewportSize)
    expect(record.factorySize.width).toBeGreaterThan(0)
    expect(record.factorySize.height).toBeGreaterThan(0)
    expect(record.destroyed).toBe(1)
    expect(record.connected).toBe(false)
    expect(record.covered).toBe(true)
    expect(record.frames[0]).toEqual({ progress: 0, index: from })
    expect(record.frames.at(-1)).toEqual({ progress: 1, index: to })
    expect(record.frames.filter(frame => frame.progress === 0.5)).toEqual([{ progress: 0.5, index: from }])
    let previous = 0
    for (const frame of record.frames) {
      expect(frame.progress).toBeGreaterThanOrEqual(previous)
      expect(frame.progress).toBeLessThanOrEqual(1)
      expect(frame.index).toBe(frame.progress <= 0.5 ? from : to)
      previous = frame.progress
    }
  }
  expect(result.index).toBe(0)
  expect(result.events).toEqual([
    ['before', 0, 1], ['start', 0, 1], ['end', 1], ['change', 0, 1],
    ['before', 1, 0], ['start', 1, 0], ['end', 0], ['change', 1, 0],
  ])
  expect(result.finalValues).toEqual(result.values)
  expect(result.finalConnections).toBe(result.initialConnections)
  expect(result.sameContent).toBe(true)
  expect(result.overlays).toBe(0)
  expect(errors).toEqual([])
})

test('custom transition instances stop rendering after update, resize and destroy cleanup', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mountCustom(page)
  const result = await page.evaluate(async () => {
    const { carousel, host, events } = window.transitionTest
    const { instances } = window.customTransitionTest
    const retired = () => instances.map(record => ({ frames: record.frames.length, destroyed: record.destroyed, connected: record.container.isConnected }))
    carousel.next()
    carousel.update({ gap: 8 })
    const afterUpdate = retired()
    await new Promise(resolve => setTimeout(resolve, 260))
    const afterUpdateWait = retired()
    const updateCompletions = events.filter(event => event[0] === 'end' || event[0] === 'change')
    const resized = new Promise(resolve => carousel.once('transition:end', resolve))
    carousel.goTo(2)
    host.style.width = '320px'
    await resized
    const indexAfterResize = carousel.getIndex()
    const resizeCompletions = events.filter(event => event[0] === 'end' || event[0] === 'change')
    carousel.goTo(1)
    carousel.destroy()
    const afterDestroy = retired()
    await new Promise(resolve => setTimeout(resolve, 260))
    return {
      afterUpdate, afterUpdateWait, updateCompletions,
      indexAfterResize, resizeCompletions,
      afterDestroy, afterDestroyWait: retired(),
      finalCompletions: events.filter(event => event[0] === 'end' || event[0] === 'change'),
      children: host.childElementCount,
      overlays: document.querySelectorAll('.carousel__transition').length,
    }
  })
  expect(result.afterUpdate).toHaveLength(1)
  expect(result.afterUpdate[0]).toMatchObject({ destroyed: 1, connected: false })
  expect(result.afterUpdateWait).toEqual(result.afterUpdate)
  expect(result.updateCompletions).toEqual([])
  expect(result.indexAfterResize).toBe(2)
  expect(result.resizeCompletions).toEqual([['end', 2], ['change', 0, 2]])
  expect(result.afterDestroy).toHaveLength(3)
  expect(result.afterDestroy.every(record => record.destroyed === 1 && !record.connected)).toBe(true)
  expect(result.afterDestroyWait).toEqual(result.afterDestroy)
  expect(result.finalCompletions).toEqual(result.resizeCompletions)
  expect(result.children).toBe(0)
  expect(result.overlays).toBe(0)
  expect(errors).toEqual([])
})

test('zero duration and reduced motion skip custom factories while retaining navigation events', async ({ page }) => {
  await mountCustom(page, { transitionDuration: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reduced = await page.evaluate(() => {
    const { carousel, host, events } = window.transitionTest
    carousel.next()
    return { index: carousel.getIndex(), factories: window.customTransitionTest.instances.length, overlays: host.querySelectorAll('.carousel__transition').length, events: [...events] }
  })
  expect(reduced).toEqual({
    index: 1, factories: 0, overlays: 0,
    events: [['before', 0, 1], ['start', 0, 1], ['end', 1], ['change', 0, 1]],
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const instant = await page.evaluate(() => {
    const { carousel, host, events } = window.transitionTest
    carousel.update({ transitionDuration: 0 })
    events.length = 0
    carousel.next()
    return { index: carousel.getIndex(), factories: window.customTransitionTest.instances.length, overlays: host.querySelectorAll('.carousel__transition').length, events: [...events] }
  })
  expect(instant).toEqual({
    index: 2, factories: 0, overlays: 0,
    events: [['before', 1, 2], ['start', 1, 2], ['end', 2], ['change', 1, 2]],
  })
})

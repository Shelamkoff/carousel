import { test, expect } from '@playwright/test'

async function mount(page, options = {}) {
  await page.goto('/tests/browser/lifecycle.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  await page.evaluate(async options => {
    const { Carousel, createArrows, createKeyboard, createParallax, createSwipe } = await import('/src/index.js')
    const host = document.createElement('div')
    host.id = 'axis-host'
    host.style.width = '580px'
    host.style.maxWidth = '100%'
    document.body.appendChild(host)
    window.__axisClicks = 0
    const slides = Array.from({ length: 3 }, (_, index) => ({
      content: () => {
        const card = document.createElement('div')
        card.style.cssText = 'height:100%;min-height:100px;background:#d8e6ff;display:flex;align-items:center;justify-content:center;gap:12px'
        const button = document.createElement('button')
        button.type = 'button'
        button.id = `axis-button-${index}`
        button.textContent = `Slide ${index + 1}`
        button.addEventListener('click', () => { window.__axisClicks++ })
        card.appendChild(button)
        if (index === 0 && options.editor) {
          const component = document.createElement('div')
          component.id = 'axis-editor-host'
          const editor = document.createElement('textarea')
          editor.id = 'axis-editor'
          editor.value = 'abc\ndef\nghi'
          editor.style.cssText = 'width:100px;height:80px;font:16px monospace'
          component.attachShadow({ mode: 'open' }).appendChild(editor)
          card.appendChild(component)
        }
        return card
      },
    }))
    const plugins = [createArrows({ hideOnEdge: false }), createKeyboard(), createSwipe({ mouse: true })]
    if (options.parallax) plugins.push(createParallax({ factor: 0.2 }))
    window.__axisCarousel = new Carousel(host, slides, {
      orientation: 'vertical', viewportHeight: 360, slidesPerView: options.perView ?? 1.15,
      loop: options.loop ?? false, transitionDuration: 0, gap: 12, plugins,
    })
  }, options)
  await page.locator('#axis-host').scrollIntoViewIfNeeded()
}

test('vertical keyboard navigates Up/Down and leaves native shadow textarea editing intact', async ({ page }) => {
  await mount(page, { editor: true })
  const root = page.locator('#axis-host .carousel')
  const editor = page.locator('#axis-editor')
  await editor.focus()
  await editor.evaluate(element => element.setSelectionRange(1, 1))
  await page.keyboard.press('ArrowDown')
  await page.keyboard.insertText('X')
  expect(await editor.inputValue()).toBe('abc\ndXef\nghi')
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(0)

  await root.focus()
  await page.keyboard.press('ArrowRight')
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(0)
  await page.keyboard.press('ArrowDown')
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(1)
  await page.keyboard.press('ArrowUp')
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(0)
  await page.keyboard.press('End')
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(2)
  await page.keyboard.press('Home')
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(0)
  await expect(page.locator('#axis-host .carousel__viewport')).toHaveCSS('touch-action', 'pan-x pinch-zoom')
  await page.evaluate(() => window.__axisCarousel.destroy())
})

for (const loop of [false, true]) {
  test(`vertical native mouse gestures preserve clicks and navigate ${loop ? 'a short fractional loop' : 'a fractional finite track'}`, async ({ page }) => {
    await mount(page, { loop, perView: loop ? 2.25 : 1.15 })
    const button = page.locator('#axis-button-0').first()
    await button.click()
    expect(await page.evaluate(() => window.__axisClicks)).toBe(1)
    const box = await button.boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 2, y - 90, { steps: 6 })
    await page.mouse.up()
    expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(1)
    expect(await page.evaluate(() => window.__axisClicks)).toBe(1)

    const viewport = await page.locator('#axis-host .carousel__viewport').boundingBox()
    await page.mouse.move(viewport.x + 100, viewport.y + viewport.height / 2)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 220, viewport.y + viewport.height / 2 + 2, { steps: 4 })
    await page.mouse.up()
    expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(1)
    await page.evaluate(() => window.__axisCarousel.destroy())
  })
}

test('orientation update retires an active pointer and switches subsequent mouse gestures to X', async ({ page }) => {
  await mount(page)
  const viewport = await page.locator('#axis-host .carousel__viewport').boundingBox()
  const x = viewport.x + 110
  const y = viewport.y + viewport.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 70, { steps: 4 })
  await page.evaluate(() => window.__axisCarousel.update({ orientation: 'horizontal' }))
  await page.mouse.move(x + 100, y - 100)
  await page.mouse.up()
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(0)
  await expect(page.locator('#axis-host .carousel__viewport')).toHaveCSS('touch-action', 'pan-y pinch-zoom')

  const horizontal = await page.locator('#axis-host .carousel__viewport').boundingBox()
  const newX = horizontal.x + horizontal.width * 0.7
  const newY = horizontal.y + horizontal.height / 2
  await page.mouse.move(newX, newY)
  await page.mouse.down()
  await page.mouse.move(newX - 160, newY, { steps: 6 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.__axisCarousel.getIndex())).toBe(1)
  await page.evaluate(() => window.__axisCarousel.destroy())
})

test('vertical touch events use fractional steps and leave horizontal touch panning to the browser', async ({ page }) => {
  await mount(page, { loop: true, perView: 2.25 })
  const result = await page.evaluate(() => {
    const viewport = document.querySelector('#axis-host .carousel__viewport')
    const pointer = (target, type, x, y) => {
      const event = new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 19, pointerType: 'touch', isPrimary: true,
        button: 0, clientX: x, clientY: y,
      })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    pointer(viewport, 'pointerdown', 100, 200)
    const horizontalPrevented = pointer(window, 'pointermove', 180, 198)
    pointer(window, 'pointerup', 180, 198)
    const afterPan = window.__axisCarousel.getIndex()
    pointer(viewport, 'pointerdown', 100, 200)
    const verticalPrevented = pointer(window, 'pointermove', 100, 80)
    pointer(window, 'pointerup', 100, 80)
    const afterSwipe = window.__axisCarousel.getIndex()
    return { horizontalPrevented, verticalPrevented, afterPan, afterSwipe }
  })
  expect(result).toEqual({ horizontalPrevented: false, verticalPrevented: true, afterPan: 0, afterSwipe: 1 })
  await page.evaluate(() => window.__axisCarousel.destroy())
})

test('parallax follows vertical loop slots and survives a live orientation change', async ({ page }) => {
  await mount(page, { loop: true, perView: 2.25, parallax: true })
  const inspect = () => page.evaluate(() => {
    const host = document.querySelector('#axis-host')
    const first = host.querySelector('.carousel__slide')
    return {
      axis: first.querySelector('.carousel__parallax__layer').style.transform.startsWith('translateY'),
      layers: host.querySelectorAll('.carousel__parallax__layer').length,
      copies: host.querySelectorAll('[data-carousel-copy]').length,
      doubleWrapped: host.querySelectorAll('.carousel__parallax .carousel__parallax').length,
    }
  })
  const vertical = await inspect()
  expect(vertical.axis).toBe(true)
  expect(vertical.layers).toBe(3 + vertical.copies)
  expect(vertical.doubleWrapped).toBe(0)
  await page.evaluate(() => { window.__axisCarousel.next(); window.__axisCarousel.update({ orientation: 'horizontal' }) })
  const horizontal = await inspect()
  expect(horizontal.axis).toBe(false)
  expect(horizontal.layers).toBe(3 + horizontal.copies)
  expect(horizontal.doubleWrapped).toBe(0)
  await page.evaluate(() => window.__axisCarousel.destroy())
})

test('nested galleries keep parallax styles, wrappers, keyboard and pointer ownership on their own axes', async ({ page }) => {
  await page.goto('/tests/browser/lifecycle.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const initial = await page.evaluate(async () => {
    const { Carousel, createKeyboard, createParallax, createSwipe } = await import('/src/index.js')
    const outerHost = document.createElement('div')
    outerHost.id = 'axis-nested-outer'
    outerHost.style.width = '580px'
    const innerHost = document.createElement('div')
    innerHost.id = 'axis-nested-inner'
    innerHost.style.cssText = 'width:580px;height:180px'
    document.body.append(outerHost, innerHost)
    // The inner carousel already has a parallax layer before the outer one
    // wraps its slide, reproducing the ownership-sensitive installation order.
    const inner = new Carousel(innerHost, Array.from({ length: 3 }, (_, index) => ({
      content: `<article style="height:180px;background:#c7d4ed">Inner ${index + 1}</article>`,
    })), {
      transitionDuration: 0,
      plugins: [createKeyboard(), createSwipe({ mouse: true }), createParallax()],
    })
    const innerLayer = innerHost.querySelector('.carousel__parallax__layer')
    const outer = new Carousel(outerHost, [
      { content: () => innerHost }, { content: 'Outer two' }, { content: 'Outer three' },
    ], {
      orientation: 'vertical', viewportHeight: 420, transitionDuration: 0,
      plugins: [createKeyboard(), createSwipe({ mouse: true }), createParallax()],
    })
    const outerLayer = outerHost.querySelector(':scope > .carousel > .carousel__viewport > .carousel__track > .carousel__slide > .carousel__parallax > .carousel__parallax__layer')
    window.__nestedAxis = { inner, outer, innerHost, innerLayer }
    return {
      separateLayers: outerLayer !== innerLayer,
      innerDirection: getComputedStyle(innerLayer).flexDirection,
      outerDirection: getComputedStyle(outerLayer).flexDirection,
      innerTransform: innerLayer.style.transform,
    }
  })
  expect(initial).toEqual({
    separateLayers: true, innerDirection: 'row', outerDirection: 'column', innerTransform: 'translateX(0%)',
  })

  const indexes = () => page.evaluate(() => ({ inner: window.__nestedAxis.inner.getIndex(), outer: window.__nestedAxis.outer.getIndex() }))
  await page.locator('#axis-nested-inner > .carousel').focus()
  await page.keyboard.press('ArrowDown')
  expect(await indexes()).toEqual({ inner: 0, outer: 0 })
  await page.keyboard.press('ArrowRight')
  expect(await indexes()).toEqual({ inner: 1, outer: 0 })
  await page.keyboard.press('Home')
  expect(await indexes()).toEqual({ inner: 0, outer: 0 })

  const viewport = page.locator('#axis-nested-inner > .carousel > .carousel__viewport')
  await viewport.scrollIntoViewIfNeeded()
  const box = await viewport.boundingBox()
  const x = box.x + 240
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 2, y - 75, { steps: 5 })
  await page.mouse.up()
  expect(await indexes()).toEqual({ inner: 0, outer: 0 })
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 140, y, { steps: 5 })
  await page.mouse.up()
  expect(await indexes()).toEqual({ inner: 1, outer: 0 })

  const preserved = await page.evaluate(() => {
    const { outer, inner, innerHost, innerLayer } = window.__nestedAxis
    outer.destroy()
    const result = innerHost.querySelector('.carousel__parallax__layer') === innerLayer
      && innerHost.querySelectorAll('.carousel__parallax__layer').length === 3
    inner.destroy()
    return result
  })
  expect(preserved).toBe(true)
})

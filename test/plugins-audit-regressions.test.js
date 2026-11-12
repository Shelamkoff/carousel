import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createLazyLoad } from '../src/plugins/lazyload.js'
import { createParallax } from '../src/plugins/parallax.js'
import { createArrows } from '../src/plugins/arrows.js'
import { createDots } from '../src/plugins/dots.js'
import { createThumbnails } from '../src/plugins/thumbnails.js'
import { createAutoplay } from '../src/plugins/autoplay.js'
import { createKeyboard } from '../src/plugins/keyboard.js'
import { createSwipe } from '../src/plugins/swipe.js'

function element(tag = 'div') {
  const listeners = new Map()
  const attributes = new Map()
  return {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(name, value) { attributes.set(name, String(value)) },
    getAttribute(name) { return attributes.get(name) ?? null },
    removeAttribute(name) { attributes.delete(name) },
    appendChild(child) { this.children.push(child); return child },
    set innerHTML(value) { this.children = [] },
    remove() {},
    addEventListener(event, handler) { listeners.set(event, handler) },
    removeEventListener(event) { listeners.delete(event) },
    dispatch(event) { listeners.get(event.type)?.({ target: this, ...event }) },
    click() { this.dispatch({ type: 'click' }) },
  }
}

function navigationContext(root, overrides = {}) {
  return eventContext({
    getRoot: () => root,
    getViewport: () => root,
    getIndex: () => 0,
    getSlidesPerScroll: () => 1,
    getSlidesPerView: () => 1,
    getSlides: () => [{}, {}, {}],
    isLoop: () => false,
    goTo() {},
    next() {},
    prev() {},
    ...overrides,
  })
}

function eventContext(overrides = {}) {
  const listeners = new Map()
  return {
    getViewport: () => null,
    getVisualElements: () => [],
    getSlideCount: () => 3,
    getStep: () => 100,
    getPosition: () => 0,
    getLoopEngine: () => null,
    getRenderState: () => ({ orientation: 'horizontal', reducedMotion: false, slides: [] }),
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
      return () => listeners.get(event)?.delete(handler)
    },
    emit(event, ...args) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(...args)
    },
    ...overrides,
  }
}

test('parallax never forks the core clock through transition, lazy loading or rebuild', () => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  const frames = new Map()
  let nextId = 0
  globalThis.requestAnimationFrame = callback => {
    const id = ++nextId
    frames.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  const plugin = createParallax()
  const context = eventContext()
  try {
    plugin.install(context)
    context.emit('transition:start')
    assert.equal(frames.size, 0)
    context.emit('slide:lazyload')
    context.emit('slide:lazyload')
    assert.equal(frames.size, 0, 'rendering lazy content must not fork the animation clock')
    context.emit('resize')
    for (let i = 0; i < 4; i++) {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback())
    }
    assert.equal(frames.size, 0, 'a cancelled transition must not leave an idle animation loop')
  } finally {
    plugin.destroy()
    if (originalRequest === undefined) delete globalThis.requestAnimationFrame
    else globalThis.requestAnimationFrame = originalRequest
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame
    else globalThis.cancelAnimationFrame = originalCancel
  }
})

test('lazy preloading visits each slide at most once even with a very large radius', () => {
  const originalObserver = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const elements = Array.from({ length: 3 }, () => ({ dataset: {}, classList: { add() {} } }))
  let lookups = 0
  const loaded = []
  const plugin = createLazyLoad({ preload: Number.MAX_SAFE_INTEGER })
  const context = eventContext({
    getViewport: () => ({}),
    getIndex: () => 0,
    isLoop: () => true,
    getSlideElements: () => [],
    getSlides: () => elements.map(() => ({ lazy: true })),
    getSlide: () => ({ lazy: true }),
    getSlideElement(index) {
      // Permit the lookup and ownership check for each slide, but fail fast
      // if an unbounded radius repeats a completed cycle.
      if (++lookups > elements.length * 3) throw new Error('preload work exceeded the slide count')
      return elements[index]
    },
    renderSlide(index) { loaded.push(index); return true },
  })
  try {
    assert.doesNotThrow(() => plugin.install(context))
    assert.deepEqual([...loaded].sort(), [0, 1, 2])
  } finally {
    plugin.destroy()
    if (originalObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = originalObserver
  }
})

test('lazy loading can destroy the carousel from a lazyload notification', () => {
  const originalObserver = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const elements = Array.from({ length: 5 }, () => ({ dataset: {}, classList: { add() {} } }))
  let index = 0
  const plugin = createLazyLoad({ preload: 1 })
  const context = eventContext({
    getViewport: () => ({}),
    getSlideCount: () => elements.length,
    getIndex: () => index,
    isLoop: () => false,
    getSlideElements: () => [],
    getSlides: () => elements.map(() => ({ lazy: true })),
    getSlide: () => ({ lazy: true }),
    getSlideElement: i => elements[i],
    renderSlide: () => true,
  })
  try {
    plugin.install(context)
    context.on('slide:lazyload', () => plugin.destroy())
    index = 3
    assert.doesNotThrow(() => context.emit('slide:change'))
  } finally {
    plugin.destroy()
    if (originalObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = originalObserver
  }
})

test('cancelled lazy rendering does not overwrite a newer successful render', () => {
  const originalObserver = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const slide = { dataset: { index: '0' }, classList: { add() {} } }
  const plugin = createLazyLoad({ preload: 0 })
  let reenter = false
  const context = eventContext({
    getViewport: () => ({}),
    getSlideCount: () => 1,
    getIndex: () => 0,
    isLoop: () => false,
    getSlideElements: () => [slide],
    getSlides: () => [{ lazy: true }],
    getSlide: () => ({ lazy: true }),
    getSlideElement: () => slide,
    renderSlide() {
      if (reenter) {
        reenter = false
        context.emit('resize')
        // TrackRenderer reports false when a nested rebuild retired this
        // operation, even if the same element was rendered by that rebuild.
        return false
      }
      slide.dataset.rendered = 'true'
      return true
    },
  })
  try {
    plugin.install(context)
    delete slide.dataset.loaded
    delete slide.dataset.rendered
    reenter = true
    context.emit('resize')
    assert.equal(slide.dataset.rendered, 'true')
    assert.equal(slide.dataset.loaded, 'true')
  } finally {
    plugin.destroy()
    if (originalObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = originalObserver
  }
})

for (const { name, count, toIndex, slidesPerView, loop, preload, expected } of [
  { name: 'fractional final page', count: 6, toIndex: 4, slidesPerView: 2.5, loop: false, preload: 0, expected: [0, 3, 4, 5] },
  { name: 'wrapped fractional page', count: 5, toIndex: 4, slidesPerView: 2.5, loop: true, preload: 0, expected: [0, 1, 4] },
  { name: 'page with adjacent preload', count: 8, toIndex: 5, slidesPerView: 2.5, loop: false, preload: 1, expected: [0, 1, 4, 5, 6, 7] },
]) {
  test(`lazy loading prepares the destination before transition start: ${name}`, () => {
    const originalObserver = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const elements = Array.from({ length: count }, (_, index) => ({
      dataset: { index: String(index) }, classList: { add() {} },
    }))
    const loaded = []
    const plugin = createLazyLoad({ preload })
    const context = eventContext({
      getViewport: () => ({}),
      getSlideCount: () => count,
      getSlidesPerView: () => slidesPerView,
      getIndex: () => 0,
      isLoop: () => loop,
      getSlideElements: () => elements,
      getSlides: () => elements.map(() => ({ lazy: true })),
      getSlide: () => ({ lazy: true }),
      getSlideElement: index => elements[index],
      renderSlide(index) {
        loaded.push(index)
        elements[index].dataset.rendered = 'true'
        return true
      },
    })
    try {
      plugin.install(context)
      context.emit('slide:beforeChange', { fromIndex: 0, toIndex })
      assert.deepEqual(loaded.sort((a, b) => a - b), expected)
      assert.equal(elements[toIndex].dataset.loaded, 'true')
    } finally {
      plugin.destroy()
      if (originalObserver === undefined) delete globalThis.IntersectionObserver
      else globalThis.IntersectionObserver = originalObserver
    }
  })
}

test('retained pagination buttons remain inert after destroy and plugin reuse', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: element }
  try {
    for (const factory of [createDots, createThumbnails]) {
      const plugin = factory()
      const root = element()
      plugin.install(navigationContext(root))
      const button = root.children[0].children[1]
      plugin.destroy()
      assert.doesNotThrow(() => button.click())
      let navigations = 0
      plugin.install(navigationContext(element(), { goTo() { navigations++ } }))
      button.click()
      assert.equal(navigations, 0, 'a retired control must not navigate the next plugin owner')
      plugin.destroy()
    }
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('empty looping pagination installs without inventing a page or recursing', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: element }
  const plugin = createDots()
  const root = element()
  const context = navigationContext(root, {
    getSlideCount: () => 0,
    isLoop: () => true,
  })
  try {
    assert.doesNotThrow(() => plugin.install(context))
    assert.equal(root.children[0].children.length, 0)
    assert.doesNotThrow(() => context.emit('slide:change'))
    assert.doesNotThrow(() => context.emit('resize'))
    assert.equal(root.children[0].children.length, 0)
  } finally {
    plugin.destroy()
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('loop pagination survives removal of the last slide, repopulation and plugin reuse', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: element }
  const plugin = createDots()
  const root = element()
  let count = 1
  let index = 0
  const navigations = []
  const context = navigationContext(root, {
    getSlideCount: () => count,
    getIndex: () => index,
    getSlidesPerScroll: () => 2,
    isLoop: () => true,
    goTo(target) { navigations.push(target) },
  })
  try {
    plugin.install(context)
    const container = root.children[0]
    const retired = container.children[0]
    assert.equal(container.children.length, 1)

    count = 0
    assert.doesNotThrow(() => context.emit('resize'))
    assert.equal(container.children.length, 0)
    retired.click()
    assert.deepEqual(navigations, [], 'a removed page must no longer navigate')

    // Rebuilding a non-empty loop still reanchors to the selected residue
    // class: with step 2 and four slides, index 1 exposes pages 1 and 3.
    count = 4
    index = 1
    context.emit('resize')
    assert.equal(container.children.length, 2)
    assert.equal(container.children[0].getAttribute('aria-current'), 'page')
    container.children.forEach(button => button.click())
    assert.deepEqual(navigations, [1, 3])

    index = 0
    context.emit('slide:change')
    container.children.forEach(button => button.click())
    assert.deepEqual(navigations, [1, 3, 0, 2])
    const previousOwnerButton = container.children[1]
    plugin.destroy()

    const nextRoot = element()
    let nextCount = 0
    let nextNavigations = 0
    const nextContext = navigationContext(nextRoot, {
      getSlideCount: () => nextCount,
      isLoop: () => true,
      goTo() { nextNavigations++ },
    })
    assert.doesNotThrow(() => plugin.install(nextContext))
    assert.equal(nextRoot.children[0].children.length, 0)
    nextCount = 2
    nextContext.emit('resize')
    assert.equal(nextRoot.children[0].children.length, 2)
    previousOwnerButton.click()
    assert.equal(nextNavigations, 0)
    nextRoot.children[0].children[1].click()
    assert.equal(nextNavigations, 1)
  } finally {
    plugin.destroy()
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('pagination and arrows never expose a nonexistent slide when slidesPerView is below one', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: element }
  try {
    const root = element()
    const context = navigationContext(root, { getIndex: () => 2, getSlidesPerView: () => 0.5 })
    const dots = createDots()
    const arrows = createArrows()
    dots.install(context)
    arrows.install(context)
    assert.equal(root.children[0].children.length, 3)
    assert.equal(root.children[2].style.display, 'none')
    dots.destroy()
    arrows.destroy()
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('autoplay stops on the final real slide when slidesPerView is below one', async () => {
  const plugin = createAutoplay({ interval: 1, pauseOnHover: false })
  const context = navigationContext(null, { getIndex: () => 2, getSlidesPerView: () => 0.5 })
  let navigations = 0
  context.next = () => { navigations++ }
  try {
    plugin.install(context)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(plugin.isActive(), false)
    assert.equal(navigations, 0)
  } finally {
    plugin.destroy()
  }
})

test('autoplay cannot be restarted from its stop event during teardown', t => {
  const timers = new Set()
  t.mock.method(globalThis, 'setTimeout', callback => { timers.add(callback); return callback })
  t.mock.method(globalThis, 'clearTimeout', callback => timers.delete(callback))
  const plugin = createAutoplay({ pauseOnHover: false })
  const context = navigationContext(null)
  let stops = 0
  context.on('autoplay:stop', () => { stops++; plugin.start() })
  try {
    plugin.install(context)
    assert.equal(timers.size, 1)
    plugin.destroy()
    assert.equal(stops, 1, 'destroy preserves the existing stop notification')
    assert.equal(plugin.isActive(), false)
    assert.equal(timers.size, 0)
    plugin.start()
    assert.equal(timers.size, 0, 'a retired plugin must not schedule new work')
    plugin.install(navigationContext(null))
    assert.equal(plugin.isActive(), true, 'an installed plugin remains reusable')
    assert.equal(timers.size, 1)
  } finally {
    plugin.destroy()
  }
})

test('autoplay waits for every held pointer and ignores unrelated pointer releases', async t => {
  const timers = new Set()
  t.mock.method(globalThis, 'setTimeout', callback => { timers.add(callback); return callback })
  t.mock.method(globalThis, 'clearTimeout', callback => timers.delete(callback))
  const eventWindow = element()
  const viewport = element()
  viewport.ownerDocument = { defaultView: eventWindow }
  const plugin = createAutoplay({ pauseOnHover: false, pauseOnInteraction: false })
  try {
    plugin.install(navigationContext(viewport))
    viewport.dispatch({ type: 'pointerdown', pointerId: 1 })
    assert.equal(timers.size, 0)
    eventWindow.dispatch({ type: 'pointerup', pointerId: 99 })
    assert.equal(timers.size, 0)
    viewport.dispatch({ type: 'pointerdown', pointerId: 2 })
    eventWindow.dispatch({ type: 'pointerup', pointerId: 2 })
    await Promise.resolve()
    assert.equal(timers.size, 0, 'the first pointer is still held')
    eventWindow.dispatch({ type: 'pointercancel', pointerId: 1 })
    await Promise.resolve()
    assert.equal(timers.size, 1)
    assert.equal(plugin.isActive(), true)
  } finally {
    plugin.destroy()
  }
})

test('keyboard navigation respects consumed events and modifier shortcuts', () => {
  const root = element()
  let navigations = 0
  const plugin = createKeyboard()
  plugin.install(navigationContext(root, { next() { navigations++ } }))
  try {
    for (const options of [{ defaultPrevented: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }]) {
      root.dispatch({ type: 'keydown', key: 'ArrowRight', preventDefault() {}, ...options })
    }
    assert.equal(navigations, 0)
    root.dispatch({ type: 'keydown', key: 'ArrowRight', preventDefault() {} })
    assert.equal(navigations, 1)
  } finally {
    plugin.destroy()
  }
})

test('keyboard leaves shadow-tree editors alone without disabling the surrounding component', () => {
  const root = Object.assign(new EventTarget(), {
    setAttribute() {}, getAttribute() { return '0' }, removeAttribute() {},
  })
  const host = { tagName: 'CUSTOM-EDITOR', isContentEditable: false }
  const shadow = { nodeType: 11, host }
  const plugin = createKeyboard()
  let navigations = 0
  plugin.install(navigationContext(root, { next() { navigations++ } }))
  // Native Event cancellation remains observable. Only the shadow retargeting
  // and composed path are supplied because Node does not implement a DOM tree.
  function keydown(target, path) {
    const event = new Event('keydown', { bubbles: true, composed: true, cancelable: true })
    Object.defineProperties(event, {
      target: { value: target },
      key: { value: 'ArrowRight' },
      composedPath: { value: path === undefined ? undefined : () => path },
    })
    root.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    const editors = [
      { tagName: 'INPUT' },
      { tagName: 'TEXTAREA' },
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
    ]
    const prevented = editors.map(editor => keydown(host, [editor, shadow, host, root]))
    prevented.push(keydown(editors[0], undefined), keydown(editors[1], []))
    const editorNavigations = navigations

    // A non-editing node in the same component still delegates navigation.
    // The scope ends at the carousel root, before an editable outer ancestor.
    const button = { tagName: 'BUTTON', isContentEditable: false }
    const outerEditor = { tagName: 'DIV', isContentEditable: true }
    const componentPrevented = keydown(host, [button, shadow, host, root, outerEditor])
    assert.deepEqual(prevented, [false, false, false, false, false, false])
    assert.equal(editorNavigations, 0)
    assert.equal(componentPrevented, true)
    assert.equal(navigations, 1)
  } finally {
    plugin.destroy()
  }
})

test('loop pagination terminates for large integer scroll steps', () => {
  // Isolate this regression: the original arithmetic enters an infinite loop,
  // so an in-process test timeout could not interrupt the blocked event loop.
  const script = `
    import { createDots } from ${JSON.stringify(new URL('../src/plugins/dots.js', import.meta.url).href)};
    const element = ${element.toString()};
    const eventContext = ${eventContext.toString()};
    const navigationContext = ${navigationContext.toString()};
    globalThis.document = { createElement: element };
    const root = element();
    const plugin = createDots();
    plugin.install(navigationContext(root, {
      getSlideCount: () => 5,
      getSlidesPerScroll: () => Number.MAX_SAFE_INTEGER,
      isLoop: () => true,
    }));
    process.stdout.write(String(root.children[0].children.length));
    plugin.destroy();
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
    timeout: 3000,
  })
  assert.equal(result.status, 0, result.error?.message || result.stderr)
  assert.equal(result.stdout, '5')
})

test('loop swipes reduce large scroll steps before adding the starting index', () => {
  const eventWindow = element()
  const viewport = element()
  viewport.closest = () => null
  viewport.ownerDocument = { defaultView: eventWindow }
  let position = 200
  const navigations = []
  const plugin = createSwipe()
  const context = navigationContext(viewport, {
    getIndex: () => 2,
    getSlideCount: () => 5,
    getSlidesPerScroll: () => Number.MAX_SAFE_INTEGER,
    isLoop: () => true,
    getPosition: () => position,
    setPositionDrag: value => { position = value },
    stopAnimation() {},
    snapBack() {},
    goToAfterDrag(...args) { navigations.push(args) },
  })
  try {
    plugin.install(context)
    viewport.dispatch({ type: 'pointerdown', pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 0 })
    eventWindow.dispatch({ type: 'pointermove', pointerId: 1, clientX: 40, clientY: 0, preventDefault() {} })
    eventWindow.dispatch({ type: 'pointerup', pointerId: 1, clientX: 40, clientY: 0 })
    assert.deepEqual(navigations, [[3, 2, 1, 200]])
  } finally {
    plugin.destroy()
  }
})

test('swiping an empty looping carousel does not navigate to a NaN index', () => {
  const eventWindow = element()
  const viewport = element()
  viewport.closest = () => null
  viewport.ownerDocument = { defaultView: eventWindow }
  const positions = []
  const plugin = createSwipe()
  const context = navigationContext(viewport, {
    getSlideCount: () => 0,
    isLoop: () => true,
    setPositionDrag: value => positions.push(value),
    stopAnimation() {},
    snapBack() {},
    goToAfterDrag(index) { assert.fail(`an empty carousel received index ${index}`) },
  })
  try {
    plugin.install(context)
    assert.doesNotThrow(() => {
      viewport.dispatch({ type: 'pointerdown', pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 0 })
      eventWindow.dispatch({ type: 'pointermove', pointerId: 1, clientX: 40, clientY: 0, preventDefault() {} })
      eventWindow.dispatch({ type: 'pointerup', pointerId: 1, clientX: 40, clientY: 0 })
    })
    assert.deepEqual(positions, [])
  } finally {
    plugin.destroy()
  }
})

test('swipe captures only horizontal drags and suppresses their ensuing pointer click', () => {
  const eventWindow = element()
  const viewport = element()
  viewport.closest = () => null
  viewport.ownerDocument = { defaultView: eventWindow }
  const captures = []
  viewport.setPointerCapture = pointerId => captures.push(pointerId)
  viewport.releasePointerCapture = () => {}
  let position = 0
  const destinations = []
  const plugin = createSwipe({ mouse: true })
  const context = navigationContext(viewport, {
    getPosition: () => position,
    setPositionDrag: value => { position = value },
    stopAnimation() {},
    snapBack() {},
    goToAfterDrag: index => destinations.push(index),
  })
  const down = () => viewport.dispatch({ type: 'pointerdown', pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 0 })
  const up = x => eventWindow.dispatch({ type: 'pointerup', pointerId: 1, clientX: x, clientY: 0 })
  const click = detail => {
    const result = { prevented: false, stopped: false }
    viewport.dispatch({
      type: 'click', detail,
      preventDefault() { result.prevented = true },
      stopPropagation() { result.stopped = true },
    })
    return result
  }
  try {
    plugin.install(context)
    down()
    assert.deepEqual(captures, [])
    up(100)
    assert.deepEqual(click(1), { prevented: false, stopped: false })

    down()
    eventWindow.dispatch({ type: 'pointermove', pointerId: 1, clientX: 98, clientY: 0, preventDefault() {} })
    assert.deepEqual(captures, [])
    eventWindow.dispatch({ type: 'pointermove', pointerId: 1, clientX: 40, clientY: 0, preventDefault() {} })
    assert.deepEqual(captures, [1])
    up(40)
    assert.deepEqual(destinations, [1])
    assert.deepEqual(click(0), { prevented: false, stopped: false }, 'keyboard activation remains available')
    assert.deepEqual(click(1), { prevented: true, stopped: true })
    down()
    up(100)
    assert.deepEqual(click(1), { prevented: false, stopped: false })
  } finally {
    plugin.destroy()
  }
})

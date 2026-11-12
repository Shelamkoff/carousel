import test from 'node:test'
import assert from 'node:assert/strict'
import { NavigationGeometry } from '../src/NavigationGeometry.js'
import { getNavigationTarget, getPageTargets } from '../src/navigation.js'
import { createLazyLoad } from '../src/plugins/lazyload.js'
import { createSwipe } from '../src/plugins/swipe.js'
import { navigationTarget, canNavigate } from '../src/plugins/navigation.js'

function geometryFor(sizes, viewportSize) {
  let offset = 0
  const slides = sizes.map(size => {
    const slide = { offset, size }
    offset += size
    return slide
  })
  return new NavigationGeometry({
    viewportSize, count: slides.length, slidesPerView: 1, gap: 0, orientation: 'horizontal',
    slides: slides.map((_, index) => ({ index })),
  }, { name: 'variable cards', measure: () => ({ slides }) })
}

function fixture(geometry, { loop = false, index = 0, slidesPerScroll = 1 } = {}) {
  const events = new Map()
  const state = { geometry, index, position: geometry.indexToPosition(index, loop), rendered: [], moves: [], navigations: [] }
  const eventWindow = new EventTarget()
  eventWindow.AbortController = AbortController
  eventWindow.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const viewport = Object.assign(new EventTarget(), {
    ownerDocument: { defaultView: eventWindow }, style: {},
    setPointerCapture() {}, releasePointerCapture() {},
  })
  const elements = geometry.slides.map((_, index) => ({
    dataset: { index: String(index) }, classList: { add() {} },
  }))
  const slides = elements.map(() => ({ lazy: true, content: () => {} }))
  const context = {
    options: { loop, slidesPerScroll, slidesPerView: 1, orientation: 'horizontal' },
    getViewport: () => viewport,
    getSlideCount: () => slides.length,
    getSlidesPerView: () => 1,
    getSlidesPerScroll: () => slidesPerScroll === 'auto' ? 1 : slidesPerScroll,
    getStep: () => state.geometry.step,
    getSlides: () => slides,
    getSlide: index => slides[index],
    getSlideElements: () => elements,
    getSlideElement: index => elements[index],
    getIndex: () => state.index,
    getPosition: () => state.position,
    getLoopEngine: () => null,
    isLoop: () => loop,
    getNavigationGeometry: () => state.geometry,
    getNavigationTarget: (direction, fromIndex = state.index) => getNavigationTarget(state.geometry, context.options, fromIndex, direction),
    getPageTargets: anchor => getPageTargets(state.geometry, context.options, anchor),
    renderSlide(index) { state.rendered.push(index); elements[index].dataset.rendered = 'true'; return true },
    stopAnimation() {},
    snapBack(index) { state.navigations.push({ snapBack: index }) },
    setPositionDrag(position) { state.position = position; state.moves.push(position) },
    goToAfterDrag(...args) { state.navigations.push(args) },
    on(name, handler) {
      if (!events.has(name)) events.set(name, new Set())
      events.get(name).add(handler)
      return () => events.get(name).delete(handler)
    },
    emit(name, detail) { for (const handler of [...(events.get(name) ?? [])]) handler(detail) },
  }
  const pointer = (type, x) => {
    const event = new Event(type, { cancelable: true })
    Object.defineProperties(event, Object.fromEntries(Object.entries({
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: 0,
    }).map(([key, value]) => [key, { value }])))
    ;(type === 'pointerdown' ? viewport : eventWindow).dispatchEvent(event)
  }
  return { context, state, elements, pointer }
}

test('built-in navigation uses physical auto pages and their finite endpoint', () => {
  const { context, state } = fixture(geometryFor([50, 50, 400, 350], 250), { slidesPerScroll: 'auto' })
  assert.equal(navigationTarget(context, 1), 2)
  assert.deepEqual(context.getPageTargets(), [0, 2, 3])
  state.index = state.geometry.lastIndex
  assert.equal(canNavigate(context), false)
  assert.equal(canNavigate(context, -1), true)
})

test('swipe chooses the nearest physical snap for variable cards', () => {
  const { context, state, pointer } = fixture(geometryFor([50, 50, 400, 350], 250))
  const swipe = createSwipe({ threshold: 10 })
  swipe.install(context)
  try {
    pointer('pointerdown', 200)
    pointer('pointermove', 110)
    pointer('pointerup', 110)
    assert.deepEqual(state.moves, [90])
    assert.deepEqual(state.navigations, [[2, 0, undefined, 0]])
  } finally { swipe.destroy() }
})

test('auto swipe advances one physical page even when the legacy resolved step is one', () => {
  const { context, state, pointer } = fixture(geometryFor([50, 50, 400, 350], 250), { slidesPerScroll: 'auto' })
  const swipe = createSwipe({ threshold: 10 })
  swipe.install(context)
  try {
    pointer('pointerdown', 200)
    pointer('pointermove', 180)
    pointer('pointerup', 180)
    assert.deepEqual(state.navigations, [[2, 0, 1, 0]])
  } finally { swipe.destroy() }
})

test('uniform auto with a one-slide page keeps long drags free to snap several slides away', () => {
  const geometry = new NavigationGeometry({ viewportSize: 100, count: 6, slidesPerView: 1, gap: 0,
    orientation: 'horizontal', slides: Array.from({ length: 6 }, (_, index) => ({ index })) })
  const { context, state, pointer } = fixture(geometry, { slidesPerScroll: 'auto' })
  const swipe = createSwipe({ threshold: 10 })
  swipe.install(context)
  try {
    pointer('pointerdown', 400)
    pointer('pointermove', 80)
    pointer('pointerup', 80)
    assert.deepEqual(state.navigations, [[3, 0, undefined, 0]])
  } finally { swipe.destroy() }
})

test('finite drag resistance uses the measured maximum rather than count times a fixed step', () => {
  const { context, state, pointer } = fixture(geometryFor([50, 50, 400, 350], 250))
  const swipe = createSwipe({ threshold: 10, resistance: 0.3 })
  swipe.install(context)
  try {
    pointer('pointerdown', 800)
    pointer('pointermove', 0)
    assert.equal(state.geometry.maxPosition, 500)
    assert.equal(state.position, 590)
    pointer('pointerup', 0)
    assert.deepEqual(state.navigations, [[3, 0, undefined, 0]])
  } finally { swipe.destroy() }
})

test('lazy preload includes all partially visible cards on the first and clipped last physical pages', () => {
  for (const [index, expected] of [[0, [0, 1, 2, 3]], [4, [3, 4]]]) {
    const { context, state } = fixture(geometryFor([100, 50, 100, 300, 75], 300), { index })
    const lazy = createLazyLoad({ preload: 0 })
    lazy.install(context)
    try { assert.deepEqual(state.rendered, expected) } finally { lazy.destroy() }
  }
})

test('loop lazy preload includes visible forward copies and complete short cycles', () => {
  for (const width of [180, 400]) {
    const { context, state } = fixture(geometryFor([80, 90, 70], width), { loop: true })
    const lazy = createLazyLoad({ preload: 0 })
    lazy.install(context)
    try { assert.deepEqual(state.rendered, [0, 1, 2], `viewport ${width}`) } finally { lazy.destroy() }
  }
})

test('physical lazy preload merges overlapping neighbor ranges without duplicate factory calls', () => {
  const { context, state } = fixture(geometryFor([1000, 10, 10, 10, 10], 1000), { loop: true })
  const lazy = createLazyLoad({ preload: 1 })
  lazy.install(context)
  try { assert.deepEqual(state.rendered, [0, 1, 4]) } finally { lazy.destroy() }
})

test('a replaced geometry retires the in-flight lazy preload traversal', () => {
  const { context, state, elements } = fixture(geometryFor([100, 100, 100, 100], 80))
  const lazy = createLazyLoad({ preload: 0 })
  lazy.install(context)
  try {
    state.rendered.length = 0
    for (const element of elements) { delete element.dataset.loaded; delete element.dataset.rendered }
    state.geometry = geometryFor([50, 50, 50, 50], 180)
    context.renderSlide = index => {
      state.rendered.push(index)
      state.geometry = geometryFor([100, 100, 100, 100], 80)
      return false
    }
    context.emit('slide:beforeChange', { toIndex: 0 })
    assert.deepEqual(state.rendered, [0])
  } finally { lazy.destroy() }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSwipe } from '../src/plugins/swipe.js'
import { createKeyboard } from '../src/plugins/keyboard.js'
import { createParallax } from '../src/plugins/parallax.js'
import { createArrows } from '../src/plugins/arrows.js'
import { LoopEngine } from '../src/LoopEngine.js'

function node(tag = 'div') {
  const attributes = new Map()
  const element = Object.assign(new EventTarget(), {
    tagName: tag.toUpperCase(), style: {}, children: [], className: '', parentNode: null,
    closest: () => null,
    setAttribute(name, value) { attributes.set(name, String(value)) },
    getAttribute: name => attributes.get(name) ?? null,
    removeAttribute: name => attributes.delete(name),
    appendChild(child) { child.remove?.(); this.children.push(child); child.parentNode = this; return child },
    insertBefore(child, reference) {
      child.remove?.()
      const index = reference ? this.children.indexOf(reference) : this.children.length
      this.children.splice(index, 0, child)
      child.parentNode = this
      return child
    },
    remove() {
      if (!this.parentNode) return
      this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1)
      this.parentNode = null
    },
    querySelector(selector) {
      for (const child of this.children) {
        if (child.classList?.contains(selector.slice(1))) return child
        const nested = child.querySelector?.(selector)
        if (nested) return nested
      }
      return null
    },
  })
  element.classList = {
    contains: name => element.className.split(' ').includes(name),
    add(...names) { element.className = [...new Set([...element.className.split(' '), ...names])].join(' ') },
    remove(...names) { element.className = element.className.split(' ').filter(name => !names.includes(name)).join(' ') },
  }
  Object.defineProperty(element, 'firstChild', { get: () => element.children[0] ?? null })
  return element
}

function emit(target, type, properties = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true })
  Object.defineProperties(event, Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, { value }]),
  ))
  target.dispatchEvent(event)
  return event
}

function fixture({ orientation = 'vertical', count = 5, perView = 1, perScroll = 1, loop = false } = {}) {
  const eventWindow = new EventTarget()
  eventWindow.AbortController = AbortController
  const viewport = node()
  const frames = new Map()
  let frameId = 0
  eventWindow.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
  eventWindow.cancelAnimationFrame = id => frames.delete(id)
  const document = { defaultView: eventWindow, body: node('body'), activeElement: null }
  document.createElement = tag => Object.assign(node(tag), { ownerDocument: document })
  viewport.ownerDocument = document
  viewport.style.touchAction = 'manipulation'
  const events = new Map()
  const state = { position: 0, index: 0, moves: [], navigations: [], captures: [], releases: [], snaps: [], stops: 0 }
  viewport.setPointerCapture = id => state.captures.push(id)
  viewport.releasePointerCapture = id => state.releases.push(id)
  const engine = loop ? new LoopEngine(count, 100) : null
  const context = {
    options: { orientation },
    getRoot: () => viewport,
    getViewport: () => viewport,
    getSlideCount: () => count,
    getSlidesPerView: () => perView,
    getSlidesPerScroll: () => perScroll,
    getStep: () => 100,
    getIndex: () => state.index,
    getPosition: () => state.position,
    getLoopEngine: () => engine,
    getVisualElements: () => [],
    isLoop: () => loop,
    stopAnimation() { state.stops++ },
    setPositionDrag(position) { state.position = position; state.moves.push(position) },
    snapBack(index) { state.snaps.push(index) },
    goToAfterDrag(...args) { state.navigations.push(args) },
    next() { state.navigations.push('next') },
    prev() { state.navigations.push('prev') },
    goTo(index) { state.navigations.push(index) },
    on(name, handler) {
      if (!events.has(name)) events.set(name, new Set())
      events.get(name).add(handler)
      return () => events.get(name)?.delete(handler)
    },
    emit(name) { for (const handler of [...(events.get(name) ?? [])]) handler() },
  }
  const pointer = (type, x, y, properties = {}) => emit(type === 'pointerdown' ? viewport : eventWindow, type, {
    pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...properties,
  })
  return { context, viewport, eventWindow, state, frames, pointer }
}

test('keyboard uses the live orientation and leaves orthogonal arrow keys to the page', () => {
  const { context, viewport, state } = fixture()
  const keyboard = createKeyboard()
  keyboard.install(context)
  try {
    assert.equal(emit(viewport, 'keydown', { key: 'ArrowLeft' }).defaultPrevented, false)
    assert.equal(emit(viewport, 'keydown', { key: 'ArrowRight' }).defaultPrevented, false)
    assert.equal(emit(viewport, 'keydown', { key: 'ArrowDown' }).defaultPrevented, true)
    assert.equal(emit(viewport, 'keydown', { key: 'ArrowUp' }).defaultPrevented, true)
    context.options.orientation = 'horizontal'
    assert.equal(emit(viewport, 'keydown', { key: 'ArrowDown' }).defaultPrevented, false)
    assert.equal(emit(viewport, 'keydown', { key: 'ArrowRight' }).defaultPrevented, true)
    emit(viewport, 'keydown', { key: 'Home' })
    emit(viewport, 'keydown', { key: 'End' })
    assert.deepEqual(state.navigations, ['next', 'prev', 'next', 0, 4])
  } finally { keyboard.destroy() }
  emit(viewport, 'keydown', { key: 'ArrowRight' })
  assert.equal(state.navigations.length, 5, 'destroy removes the keyboard handler')
})

test('vertical keyboard does not take arrows from shadow editors, shortcuts or composition', () => {
  const { context, viewport, state } = fixture()
  const keyboard = createKeyboard()
  keyboard.install(context)
  try {
    for (const editor of [node('input'), node('textarea'), node('select'), { isContentEditable: true }]) {
      const event = emit(viewport, 'keydown', { key: 'ArrowDown', composedPath: () => [editor, {}, viewport] })
      assert.equal(event.defaultPrevented, false)
    }
    for (const property of ['altKey', 'ctrlKey', 'metaKey', 'isComposing']) {
      assert.equal(emit(viewport, 'keydown', { key: 'ArrowDown', [property]: true }).defaultPrevented, false)
    }
    assert.deepEqual(state.navigations, [])
    emit(viewport, 'keydown', { key: 'ArrowDown', composedPath: () => [node('button'), viewport] })
    assert.deepEqual(state.navigations, ['next'])
  } finally { keyboard.destroy() }
})

test('vertical swipe follows Y displacement and only captures after a main-axis drag', () => {
  const { context, viewport, state, pointer } = fixture()
  const swipe = createSwipe()
  swipe.install(context)
  try {
    assert.equal(viewport.style.touchAction, 'pan-x pinch-zoom')
    pointer('pointerdown', 200, 250)
    pointer('pointermove', 201, 247)
    assert.deepEqual(state.captures, [])
    assert.equal(pointer('pointermove', 204, 140).defaultPrevented, true)
    assert.deepEqual(state.moves, [110])
    assert.deepEqual(state.captures, [7])
    pointer('pointerup', 204, 140)
    assert.deepEqual(state.navigations, [[1, 0, undefined, 0]])
    assert.deepEqual(state.releases, [7])
  } finally { swipe.destroy() }
  assert.equal(viewport.style.touchAction, 'manipulation')
})

test('vertical swipe yields cross-axis pans, ignores foreign pointers, and cancels on geometry changes', () => {
  const { context, viewport, state, pointer } = fixture()
  const swipe = createSwipe()
  swipe.install(context)
  try {
    pointer('pointerdown', 200, 250)
    assert.equal(pointer('pointermove', 160, 248).defaultPrevented, false)
    pointer('pointerup', 160, 248)
    assert.deepEqual(state.moves, [])
    assert.deepEqual(state.navigations, [])
    assert.deepEqual(state.snaps, [0])

    pointer('pointerdown', 200, 250)
    pointer('pointermove', 200, 50, { pointerId: 8 })
    assert.deepEqual(state.moves, [])
    pointer('pointermove', 200, 190)
    assert.deepEqual(state.moves, [60])
    context.options.orientation = 'horizontal'
    context.emit('resize')
    assert.equal(viewport.style.touchAction, 'pan-y pinch-zoom')
    pointer('pointermove', 20, 20)
    pointer('pointerup', 20, 20)
    assert.deepEqual(state.moves, [60], 'retired pointer cannot continue on the changed axis')
    assert.deepEqual(state.navigations, [])
    assert.equal(emit(viewport, 'click', { detail: 1 }).defaultPrevented, true,
      'a cancelled drag must not activate content at its new screen position')

    state.position = 0
    pointer('pointerdown', 200, 250)
    pointer('pointermove', 120, 252)
    pointer('pointerup', 120, 252)
    assert.deepEqual(state.navigations, [[1, 0, undefined, 0]])
  } finally { swipe.destroy() }
})

test('vertical swipe applies finite resistance using fractional slidesPerView and preserves short loop direction', () => {
  for (const loop of [false, true]) {
    const { context, state, pointer } = fixture({ count: 3, perView: 2.25, perScroll: 2, loop })
    const swipe = createSwipe({ resistance: 0.3 })
    swipe.install(context)
    try {
      pointer('pointerdown', 100, 200)
      pointer('pointermove', 100, 50)
      pointer('pointerup', 100, 50)
      assert.equal(state.position, loop ? 150 : 97.5)
      assert.deepEqual(state.navigations, [[loop ? 2 : 1, 0, 1, 0]])
    } finally { swipe.destroy() }
  }
})

test('swipe leaves built-in controls and composed-path editors in control of their pointer gestures', () => {
  const { context, viewport, state, pointer } = fixture()
  const swipe = createSwipe()
  swipe.install(context)
  try {
    const control = node('button')
    control.closest = selector => selector.includes('.carousel__controls') ? {} : null
    for (const editor of [control, node('input'), node('textarea'), node('select'), { isContentEditable: true }]) {
      pointer('pointerdown', 100, 200, { composedPath: () => [editor, {}, viewport] })
      pointer('pointermove', 100, 50)
      pointer('pointerup', 100, 50)
    }
    assert.equal(state.stops, 0)
    assert.deepEqual(state.moves, [])
    assert.deepEqual(state.navigations, [])
    // Non-editing content remains draggable in the same component.
    pointer('pointerdown', 100, 200, { composedPath: () => [node('span'), viewport] })
    pointer('pointermove', 100, 100)
    pointer('pointerup', 100, 100)
    assert.equal(state.navigations.length, 1)
  } finally { swipe.destroy() }
  pointer('pointerdown', 100, 200)
  pointer('pointermove', 100, 100)
  pointer('pointerup', 100, 100)
  assert.equal(state.navigations.length, 1, 'destroy aborts viewport and window listeners')
})

for (const loop of [false, true]) {
  test(`parallax follows the active axis ${loop ? 'through loop slots' : 'in finite layouts'} without reading layout`, () => {
    const { context, viewport, frames } = fixture({ loop, count: 3 })
    const layers = Array.from({ length: 3 }, () => {
      const layer = node()
      layer.className = 'carousel__parallax__layer'
      return layer
    })
    const visual = layers.map((layer, index) => {
      const slide = node()
      const wrapper = node()
      wrapper.className = 'carousel__parallax'
      wrapper.appendChild(layer)
      slide.appendChild(wrapper)
      slide.ownerDocument = viewport.ownerDocument
      slide.style.transform = `translate3d(0, ${index * 100}px, 0)`
      slide.getBoundingClientRect = () => assert.fail('parallax should not force layout')
      return slide
    })
    context.getVisualElements = () => visual
    context.getRenderState = () => ({ orientation: context.options.orientation, reducedMotion: false,
      slides: visual.map((element, index) => ({ element, index, isCopy: false, progress: index })),
    })
    const parallax = createParallax({ factor: 0.2 })
    parallax.install(context)
    try {
      assert.equal(layers[0].style.transform, 'translateY(0%)')
      assert.ok(Math.abs(parseFloat(layers[1].style.transform.slice(11)) + 20) < 1e-10)
      context.options.orientation = 'horizontal'
      visual.forEach((slide, index) => { slide.style.transform = `translate3d(${index * 100}px, 0, 0)` })
      context.emit('resize')
      assert.equal(layers[0].style.transform, 'translateX(0%)')
      assert.ok(Math.abs(parseFloat(layers[2].style.transform.slice(11)) + 40) < 1e-10)
      context.emit('transition:start')
      assert.equal(frames.size, 0, 'only the core owns animation scheduling')
      context.emit('resize')
      assert.equal(frames.size, 0)
    } finally { parallax.destroy() }
    assert.equal(frames.size, 0)
  })
}

test('arrows mark only default icons for orientation-specific CSS', () => {
  const { context, viewport } = fixture()
  const arrows = createArrows({ prevHTML: '<span>Custom</span>' })
  arrows.install(context)
  try {
    assert.equal(viewport.children[0].className.includes('carousel__arrow--default-icon'), false)
    assert.equal(viewport.children[1].className.includes('carousel__arrow--default-icon'), true)
  } finally { arrows.destroy() }
})

test('nested carousels own navigation keys and pointer gestures even when their axes differ', () => {
  const { context, viewport, state, pointer } = fixture()
  const nested = node()
  nested.className = 'carousel'
  const target = node('button')
  const path = () => [target, nested, viewport]
  const keyboard = createKeyboard()
  const swipe = createSwipe()
  keyboard.install(context)
  swipe.install(context)
  try {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      assert.equal(emit(viewport, 'keydown', { key, composedPath: path }).defaultPrevented, false)
    }
    pointer('pointerdown', 100, 200, { composedPath: path })
    pointer('pointermove', 100, 50)
    pointer('pointerup', 100, 50)
    assert.deepEqual(state.navigations, [])
    assert.deepEqual(state.moves, [])
    assert.equal(state.stops, 0, 'outer carousel must not cancel its own transition for an inner drag')
  } finally { keyboard.destroy(); swipe.destroy() }
})

test('parallax wraps its own slide and never adopts or tears down a nested carousel layer', () => {
  const { context, viewport } = fixture({ count: 1 })
  const create = className => {
    const element = viewport.ownerDocument.createElement('div')
    element.className = className
    return element
  }
  const outerSlide = create('carousel__slide')
  const innerRoot = create('carousel')
  const innerWrapper = create('carousel__parallax')
  const innerLayer = create('carousel__parallax__layer')
  const content = create('application-content')
  innerLayer.style.transform = 'translateX(12%)'
  innerLayer.appendChild(content)
  innerWrapper.appendChild(innerLayer)
  innerRoot.appendChild(innerWrapper)
  outerSlide.appendChild(innerRoot)
  context.getVisualElements = () => [outerSlide]
  context.getRenderState = () => ({ orientation: context.options.orientation, reducedMotion: false,
    slides: [{ element: outerSlide, index: 0, isCopy: false, progress: 0 }],
  })
  const parallax = createParallax()
  parallax.install(context)
  try {
    assert.equal(outerSlide.firstChild.className, 'carousel__parallax')
    assert.notEqual(outerSlide.firstChild, innerWrapper)
    assert.equal(innerLayer.style.transform, 'translateX(12%)')
    context.emit('resize')
    assert.equal(outerSlide.children.length, 1)
  } finally { parallax.destroy() }
  assert.equal(outerSlide.firstChild, innerRoot)
  assert.equal(innerRoot.firstChild, innerWrapper)
  assert.equal(innerWrapper.firstChild, innerLayer)
  assert.equal(innerLayer.firstChild, content)
  assert.equal(innerLayer.style.transform, 'translateX(12%)')
})

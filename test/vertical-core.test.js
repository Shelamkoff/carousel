import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { Carousel } from '../src/Carousel.js'

const saved = new Map(['document', 'window', 'HTMLElement', 'ResizeObserver', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame']
  .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
    this.style = { touchAction: '', setProperty(name, value) { this[name] = value } }
    this.dataset = {}
    this.attributes = new Map()
    this.nodes = []
    this.parentNode = null
    this.width = null
    this.height = null
    this.listeners = new Map()
    this.classes = new Set()
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      contains: value => this.classes.has(value),
      toggle: (value, enabled) => {
        if (enabled ?? !this.classes.has(value)) this.classes.add(value)
        else this.classes.delete(value)
      },
    }
  }

  get className() { return [...this.classes].join(' ') }
  set className(value) { this.classes = new Set(value.split(' ').filter(Boolean)) }
  get childNodes() { return this.nodes }
  get children() { return this.nodes }
  get firstChild() { return this.nodes[0] ?? null }
  get offsetWidth() { return this.width ?? this.parentNode?.offsetWidth ?? 100 }
  get offsetHeight() {
    if (this.height !== null) return this.height
    if (this.style.height?.endsWith('px')) return parseFloat(this.style.height)
    if (this.classList.contains('carousel__viewport') && this.parentNode?.classList.contains('carousel--vertical')) return 400
    return 20
  }
  get scrollHeight() { return 20 }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }

  insertBefore(node, reference) {
    node.remove()
    const at = reference ? this.nodes.indexOf(reference) : -1
    if (at < 0) this.nodes.push(node)
    else this.nodes.splice(at, 0, node)
    node.parentNode = this
    return node
  }

  appendChild(node) { return this.insertBefore(node, null) }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)) }

  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.nodes.indexOf(this)
    if (index >= 0) this.parentNode.nodes.splice(index, 1)
    this.parentNode = null
  }

  replaceChildren(...nodes) {
    for (const node of [...this.nodes]) node.remove()
    nodes.forEach(node => this.appendChild(node))
  }

  set innerHTML(value) { this.replaceChildren(); this.markup = String(value) }
  get innerHTML() { return this.markup ?? '' }

  cloneNode(deep) {
    const node = new Element(this.tagName)
    node.style = { ...this.style }
    node.className = this.className
    node.dataset = { ...this.dataset }
    node.attributes = new Map(this.attributes)
    node.markup = this.markup
    if (deep) for (const child of this.nodes) node.appendChild(child.cloneNode(true))
    return node
  }

  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(callback)
    options.signal?.addEventListener('abort', () => this.removeEventListener(type, callback), { once: true })
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback) }
  dispatchEvent(event) {
    event.target ??= this
    for (const callback of [...(this.listeners.get(event.type) ?? [])]) callback(event)
  }
  closest() { return null }
  setPointerCapture() {}
  releasePointerCapture() {}
  querySelector(selector) {
    if (!selector.startsWith('.')) return null
    const className = selector.slice(1)
    for (const child of this.nodes) {
      if (child.classList.contains(className)) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
}


const clock = { now: 0, next: 0, frames: new Map() }
const queries = new Set()
let windowWidth = 800
const view = new Element('window')
view.matchMedia = query => {
  const minWidth = Number(query.match(/min-width: (\d+)px/)?.[1])
  const listeners = new Set()
  const item = {
    get matches() { return !!minWidth && windowWidth >= minWidth },
    addEventListener(_, fn) { listeners.add(fn) },
    removeEventListener(_, fn) { listeners.delete(fn) },
    flush() { for (const fn of listeners) fn() },
  }
  queries.add(item)
  return item
}
globalThis.HTMLElement = Element
globalThis.document = { createElement: tag => new Element(tag), querySelector: () => null }
globalThis.window = view
globalThis.performance = { now: () => clock.now }
globalThis.requestAnimationFrame = callback => {
  const id = ++clock.next
  clock.frames.set(id, callback)
  return id
}
globalThis.cancelAnimationFrame = id => clock.frames.delete(id)
globalThis.ResizeObserver = class {
  static instances = new Set()
  constructor(callback) { this.callback = callback; this.constructor.instances.add(this) }
  observe() {}
  disconnect() { this.constructor.instances.delete(this) }
  static flush() { for (const item of [...this.instances]) item.callback([]) }
}
function frame(ms = 16) {
  clock.now += ms
  const callbacks = [...clock.frames.values()]
  clock.frames.clear()
  for (const fn of callbacks) fn(clock.now)
}
function mount(t, options = {}, count = 7) {
  const host = new Element()
  host.width = 600
  let context
  const carousel = new Carousel(host, Array.from({ length: count }, (_, i) => ({ content: String(i) })), {
    transitionDuration: 0,
    ...options,
    plugins: [{ name: 'probe', install(ctx) { context = ctx } }],
  })
  t.after(() => carousel.destroy())
  return { host, carousel, context, root: context.getRoot(), viewport: context.getViewport(), track: context.getTrack() }
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`)
function offsets(element) {
  return (element.style.transform.match(/translate3d\(([^)]+)\)/)?.[1] ?? '0, 0, 0').split(',').map(parseFloat)
}

for (const orientation of ['horizontal', 'vertical']) {
  for (const perView of [1.15, 2.25]) {
    test(`${orientation} finite geometry preserves fractional ${perView} and clamps the final page`, t => {
      const { carousel, context, viewport, track } = mount(t, { orientation, viewportHeight: 420, slidesPerView: perView, gap: 12 })
      const size = orientation === 'vertical' ? 420 : 600
      const slideSize = (size - 12 * (perView - 1)) / perView
      close(context.getStep(), slideSize + 12)
      for (const slide of context.getSlideElements()) close(parseFloat(slide.style.flexBasis), slideSize)
      assert.equal(viewport.style.height, orientation === 'vertical' ? '420px' : '')
      carousel.goTo(6)
      close(context.getPosition(), (7 - perView) * context.getStep())
      const position = offsets(track)
      close(position[orientation === 'vertical' ? 1 : 0], -context.getPosition())
      assert.equal(position[orientation === 'vertical' ? 0 : 1], 0)
      const finalIndex = carousel.getIndex()
      carousel.next()
      assert.equal(carousel.getIndex(), finalIndex)
    })

    test(`${orientation} fractional ${perView} short loop retains contiguous slots and originals`, t => {
      const count = Math.ceil(perView)
      const { carousel, context } = mount(t, { orientation, viewportHeight: 420, slidesPerView: perView, gap: 12, loop: true }, count)
      carousel.prev()
      assert.equal(carousel.getIndex(), count - 1)
      context.setPositionDrag(context.getPosition() + context.getStep() * 0.63)
      const main = orientation === 'vertical' ? 1 : 0
      const slides = context.getVisualElements()
      const size = orientation === 'vertical' ? 420 : 600
      const slideSize = context.getStep() - 12
      const visible = slides.map(slide => ({ slide, at: offsets(slide)[main] }))
        .filter(slot => slot.at < size && slot.at + slideSize > 0).sort((a, b) => a.at - b.at)
      assert.ok(visible[0].at <= 0)
      assert.ok(visible.at(-1).at + slideSize >= size)
      for (let i = 1; i < visible.length; i++) close(visible[i].at - visible[i - 1].at, context.getStep())
      for (const slide of context.getSlideElements()) {
        const logical = Number(slide.dataset.index)
        const overlap = node => Math.max(0, Math.min(size, offsets(node)[main] + slideSize) - Math.max(0, offsets(node)[main]))
        const peers = slides.filter(node => Number(node.dataset.index) === logical)
        assert.ok(overlap(slide) >= Math.max(...peers.map(overlap)) - 1e-7)
      }
    })
  }
}

test('vertical observed height resize preserves the chosen slide and cancels retired frames', t => {
  const { carousel, context, viewport } = mount(t, { orientation: 'vertical', slidesPerView: 2.25, loop: true })
  carousel.goTo(5)
  const step = context.getStep()
  const changes = []
  carousel.on('resize', payload => changes.push(payload))
  viewport.height = 540
  ResizeObserver.flush()
  viewport.height = 630
  ResizeObserver.flush()
  frame()
  assert.equal(carousel.getIndex(), 5)
  close(context.getStep(), step * 630 / 400)
  close(context.getPosition(), 5 * context.getStep())
  assert.equal(changes.length, 1)
  viewport.height = 700
  ResizeObserver.flush()
  carousel.destroy()
  assert.equal(clock.frames.size, 0)
})

test('responsive orientation changes retain original slide nodes and release vertical styles', t => {
  windowWidth = 800
  const { carousel, context, root, viewport } = mount(t, {
    viewportHeight: 420, slidesPerView: 1.15,
    breakpoints: { 900: { orientation: 'vertical', slidesPerView: 2.25 } },
  })
  t.after(() => { windowWidth = 800 })
  carousel.goTo(3)
  const originals = context.getSlideElements()
  const input = new Element('input')
  input.value = 'retained'
  originals[3].appendChild(input)
  windowWidth = 1000
  for (const query of queries) query.flush()
  assert.equal(root.classList.contains('carousel--vertical'), true)
  assert.equal(viewport.style.height, '420px')
  assert.equal(carousel.getIndex(), 3)
  assert.equal(context.getSlideElement(3).children[0], input)
  assert.equal(input.value, 'retained')
  assert.ok(parseFloat(context.getSlideElement(0).style.height) > 0)
  windowWidth = 800
  for (const query of queries) query.flush()
  assert.equal(root.classList.contains('carousel--vertical'), false)
  assert.equal(viewport.style.height, '')
  assert.deepEqual(context.getSlideElements(), originals)
  assert.equal(context.getSlideElement(0).style.height, '')
  assert.equal(context.getSlideElement(0).style.minHeight, '')
  assert.equal(carousel.getIndex(), 3)
})

test('vertical focus uses vertical bounds and clears both native scroll axes', async t => {
  const { carousel, context, viewport } = mount(t, { orientation: 'vertical', viewportHeight: 420 })
  const slide = context.getSlideElement(3)
  const input = new Element('input')
  slide.appendChild(input)
  input.ownerDocument = document
  document.activeElement = input
  viewport.getBoundingClientRect = () => ({ left: 0, right: 600, top: 0, bottom: 420, width: 600, height: 420 })
  input.getBoundingClientRect = () => ({ left: 20, right: 120, top: 1260, bottom: 1300, width: 100, height: 40 })
  viewport.scrollTop = 900
  viewport.scrollLeft = 15
  viewport.dispatchEvent({ type: 'focusin', target: input, composedPath: () => [input, slide, context.getTrack(), viewport] })
  await Promise.resolve()
  assert.equal(carousel.getIndex(), 3)
  assert.equal(viewport.scrollTop, 0)
  assert.equal(viewport.scrollLeft, 0)
})

test('vertical fade restores finite sizing after completion and orientation update', async t => {
  const { carousel, context, track, viewport } = mount(t, { orientation: 'vertical', viewportHeight: 420, transition: 'fade', transitionDuration: 10 })
  const completed = new Promise(resolve => carousel.once('transition:end', resolve))
  carousel.next()
  assert.equal(track.style.height, '420px')
  assert.equal(context.getSlideElement(1).style.width, '100%')
  assert.equal(context.getSlideElement(1).style.height, '420px')
  await completed
  assert.equal(carousel.getIndex(), 1)
  assert.equal(context.getSlideElement(1).style.position, '')
  assert.equal(track.style.height, '420px')
  assert.deepEqual(offsets(track), [0, -420, 0])
  carousel.update({ orientation: 'horizontal' })
  assert.equal(viewport.style.height, '')
  assert.equal(track.style.height, '')
  assert.equal(context.getSlideElement(0).style.height, '')
  assert.equal(context.getSlideElement(0).style.width, '600px')
  assert.deepEqual(offsets(track), [-600, 0, 0])
})

test('empty and single-slide vertical layouts have finite positions and release resources', t => {
  for (const count of [0, 1]) {
    const { carousel, context, track } = mount(t, { orientation: 'vertical', viewportHeight: 320, slidesPerView: 1.15, loop: true }, count)
    carousel.prev(); carousel.next(); carousel.goTo(10)
    assert.equal(carousel.getIndex(), 0)
    assert.ok(Number.isFinite(context.getPosition()))
    assert.equal(track.style.height, '320px')
    carousel.destroy()
  }
  assert.equal(ResizeObserver.instances.size, 0)
  assert.equal(clock.frames.size, 0)
})

test('orientation and height validation covers future breakpoints without altering live state', t => {
  for (const options of [
    { orientation: 'diagonal' }, { orientation: null },
    ...[0, -10, NaN, Infinity, '400px', null].map(viewportHeight => ({ viewportHeight })),
    { breakpoints: { 2000: { orientation: 'diagonal' } } },
  ]) {
    const host = new Element()
    assert.throws(() => new Carousel(host, [], options))
    assert.equal(host.children.length, 0)
  }
  const { carousel, context } = mount(t, { orientation: 'vertical' })
  assert.throws(() => carousel.update({ viewportHeight: -5 }))
  assert.equal(context.options.orientation, 'vertical')
  assert.equal(context.getStep(), 400)
  assert.equal(context.getPlugin('probe'), carousel.getPlugin('probe'))
})

test('vertical width-only resize retires cached cover geometry without changing slide step', t => {
  let created = 0, destroyed = 0, ended = 0
  const { carousel, context, host } = mount(t, {
    orientation: 'vertical', viewportHeight: 420, loop: true, slidesPerView: 2.25,
    transitionDuration: 1000,
    transition: { name: 'width-resize', create() {
      created++
      return { render() {}, destroy() { destroyed++ } }
    } },
  })
  const step = context.getStep()
  carousel.on('transition:end', () => ended++)
  carousel.goTo(4)
  assert.equal(created, 1)
  host.width = 350
  ResizeObserver.flush()
  frame()
  assert.equal(destroyed, 1)
  assert.equal(ended, 1)
  assert.equal(carousel.getIndex(), 4)
  assert.equal(context.getStep(), step)
  ResizeObserver.flush()
  frame()
  assert.equal(destroyed, 1)
  assert.equal(ended, 1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { Carousel } from '../src/Carousel.js'
import { createSwipe } from '../src/plugins/swipe.js'

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
    this.style = { touchAction: '' }
    this.dataset = {}
    this.attributes = new Map()
    this.nodes = []
    this.parentNode = null
    this.width = null
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
  get offsetHeight() { return 20 }
  get scrollHeight() { return 20 }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }

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
  querySelector() { return null }
}

const clock = { now: 0, next: 0, frames: new Map() }
globalThis.HTMLElement = Element
globalThis.document = { createElement: tag => new Element(tag), querySelector: () => null, body: new Element('body') }
globalThis.window = new Element('window')
globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
const originalPerformance = globalThis.performance
globalThis.performance = { now: () => clock.now }
globalThis.requestAnimationFrame = callback => {
  const id = ++clock.next
  clock.frames.set(id, callback)
  return id
}
globalThis.cancelAnimationFrame = id => clock.frames.delete(id)

function frame(ms) {
  clock.now += ms
  const callbacks = [...clock.frames.values()]
  clock.frames.clear()
  callbacks.forEach(callback => callback(clock.now))
}

function mount(width, count, options = {}) {
  const host = new Element()
  host.width = width
  const slides = Array.from({ length: count }, (_, index) => ({ content: String(index) }))
  const carousel = new Carousel(host, slides, options)
  const root = host.children[0]
  return { host, carousel, viewport: root.children[0], track: root.children[0].children[0] }
}

function pointer(viewport, action, dx, pointerId = 1) {
  viewport.dispatchEvent({ type: 'pointerdown', pointerId, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 0 })
  window.dispatchEvent({ type: 'pointermove', pointerId, pointerType: 'touch', clientX: 100 + dx, clientY: 0, preventDefault() {} })
  window.dispatchEvent({ type: action, pointerId, pointerType: 'touch', clientX: 100 + dx, clientY: 0 })
}

test('loop fills a multi-slide viewport and replicates short loops', () => {
  const { carousel, track } = mount(300, 4, { loop: true, slidesPerView: 3, transitionDuration: 0 })
  const positions = track.children.map(slide => Number(slide.style.transform.match(/translate3d\((-?[\d.]+)px/)?.[1]))
  assert.deepEqual(positions.slice(0, 3), [0, 100, 200])
  carousel.destroy()
  const small = mount(300, 3, { loop: true, slidesPerView: 3, transitionDuration: 0 })
  assert.equal(small.track.children.length, 6)
  assert.equal(small.track.children[3].getAttribute('aria-hidden'), 'true')
  small.carousel.destroy()
})

test('a qualifying swipe advances one slide from its initial logical index', () => {
  const { carousel, viewport } = mount(100, 5, { transitionDuration: 0, plugins: [createSwipe({ threshold: 50 })] })
  const changes = []
  carousel.on('slide:change', event => changes.push(event))
  pointer(viewport, 'pointerup', -60)
  assert.equal(carousel.getIndex(), 1)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].prevIndex, 0)
  assert.equal(changes[0].index, 1)
  carousel.destroy()
})

test('subthreshold drags and pointercancel restore the original slide', () => {
  const { carousel, viewport } = mount(60, 5, { transitionDuration: 0, plugins: [createSwipe({ threshold: 50 })] })
  let changes = 0
  carousel.on('slide:change', () => changes++)
  pointer(viewport, 'pointerup', -40)
  assert.equal(carousel.getIndex(), 0)
  pointer(viewport, 'pointercancel', -65)
  assert.equal(carousel.getIndex(), 0)
  assert.equal(changes, 0)
  carousel.destroy()
})

test('breakpoint-free update preserves DOM nodes and their listeners', () => {
  const { carousel, track } = mount(300, 4, { slidesPerView: 2, transitionDuration: 0 })
  const original = track.children[0]
  const input = new Element('input')
  input.value = 'kept'
  original.appendChild(input)
  let clicks = 0
  original.addEventListener('click', () => clicks++)
  carousel.update({ gap: 12 })
  assert.equal(track.children[0], original)
  assert.equal(track.children[0].children[0], input)
  original.dispatchEvent({ type: 'click' })
  assert.equal(clicks, 1)
  carousel.destroy()
})

test('event-driven navigation cannot synchronously recurse', async () => {
  const { carousel } = mount(100, 5, { transitionDuration: 0 })
  carousel.on('slide:beforeChange', ({ toIndex }) => {
    if (toIndex === 1) carousel.goTo(3)
  })
  carousel.goTo(1)
  assert.equal(carousel.getIndex(), 1)
  await Promise.resolve()
  assert.equal(carousel.getIndex(), 3)
  carousel.destroy()
})

test('multi-slide fade fallback animates instead of teleporting', () => {
  const { carousel, track } = mount(200, 5, { slidesPerView: 2, transition: 'fade', transitionDuration: 200 })
  carousel.next()
  assert.equal(carousel.getIndex(), 0)
  frame(20)
  assert.ok(track.style.transform.includes('translate3d(-'))
  carousel.destroy()
})

test.after(() => { globalThis.performance = originalPerformance })

import test from 'node:test'
import assert from 'node:assert/strict'
import { Carousel } from '../src/Carousel.js'
import { createSwipe } from '../src/plugins/swipe.js'
import { createParallax } from '../src/plugins/parallax.js'
import { createLazyLoad } from '../src/plugins/lazyload.js'
import { createDots } from '../src/plugins/dots.js'
import { createArrows } from '../src/plugins/arrows.js'
import { createAutoplay } from '../src/plugins/autoplay.js'

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
    this.style = { touchAction: '', setProperty(name, value) { this[name] = value } }
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
globalThis.HTMLElement = Element
globalThis.document = { createElement: tag => new Element(tag), querySelector: () => null, body: new Element('body') }
globalThis.window = new Element('window')
globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.ResizeObserver = class {
  static instances = new Set()
  constructor(callback) {
    this.callback = callback
    this.constructor.instances.add(this)
  }
  observe() {}
  disconnect() { this.constructor.instances.delete(this) }
  static flush() {
    for (const instance of [...this.instances]) instance.callback([])
  }
}
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
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

test('inserting neighboring slides retains live DOM nodes and listeners', () => {
  const { carousel, track } = mount(300, 4, { slidesPerView: 2, transitionDuration: 0 })
  const original = track.children[0]
  const input = new Element('input')
  input.value = 'kept'
  original.appendChild(input)
  let clicks = 0
  original.addEventListener('click', () => clicks++)
  carousel.addSlide({ content: 'inserted' }, 4)
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

test('lazyload and parallax agree on the same renderer and retain layer wrappers', () => {
  const host = new Element()
  host.width = 200
  const slides = Array.from({ length: 4 }, (_, index) => ({
    lazy: true,
    content: () => {
      const node = new Element('section')
      node.dataset.slide = String(index)
      return node
    },
  }))
  const carousel = new Carousel(host, slides, {
    loop: true,
    slidesPerView: 2,
    transitionDuration: 0,
    plugins: [createParallax(), createLazyLoad({ preload: 0 })],
  })
  const track = host.children[0].children[0].children[0]
  assert.equal(track.children[0].dataset.loaded, 'true')
  assert.ok(track.children[0].querySelector('.carousel__parallax__layer'))
  carousel.next()
  assert.equal(track.children[1].dataset.loaded, 'true')
  assert.ok(track.children[1].querySelector('.carousel__parallax__layer'))
  assert.equal(track.children[1].querySelector('.carousel__parallax__layer').children.length, 1)
  carousel.destroy()
})

test('the plugin options proxy enumerates live resolved options and stays read-only', () => {
  const plugin = {
    name: 'options-test',
    install(context) { this.options = context.options },
  }
  const { carousel } = mount(200, 3, { plugins: [plugin] })
  assert.equal({ ...plugin.options }.slidesPerView, 1)
  carousel.update({ slidesPerView: 2 })
  assert.equal({ ...plugin.options }.slidesPerView, 2)
  assert.throws(() => { plugin.options.gap = 8 }, TypeError)
  carousel.destroy()
})

test('loop dots track every visited page, including modular wraparound', () => {
  const { host, carousel } = mount(100, 5, {
    loop: true, slidesPerScroll: 2, transitionDuration: 0, plugins: [createDots()],
  })
  const dots = host.children[0].children[1]
  assert.equal(dots.children.length, 5)
  for (const [page, index] of [[1, 2], [2, 4], [3, 1], [4, 3], [0, 0]]) {
    carousel.next()
    assert.equal(carousel.getIndex(), index)
    assert.equal(dots.children[page].getAttribute('aria-current'), 'page')
  }
  carousel.destroy()
})

test('navigation arrows hide if no distinct destination exists', () => {
  const { carousel, viewport } = mount(100, 1, { loop: true, plugins: [createArrows()] })
  assert.equal(viewport.children[1].style.display, 'none')
  assert.equal(viewport.children[2].style.display, 'none')
  carousel.destroy()
})

test('autoplay retries a no-op navigation instead of stalling', async () => {
  let navigations = 0
  let secondAttempt
  const retried = new Promise(resolve => { secondAttempt = resolve })
  const plugin = createAutoplay({ interval: 1, pauseOnHover: false, pauseOnInteraction: false })
  const context = {
    getRoot: () => null,
    getSlideCount: () => 3,
    getSlidesPerView: () => 1,
    getIndex: () => 0,
    isLoop: () => true,
    on: () => () => {},
    emit: () => {},
    next: () => { if (++navigations === 2) secondAttempt() },
  }
  plugin.install(context)
  try {
    await Promise.race([
      retried,
      new Promise((_, reject) => setTimeout(() => reject(new Error('autoplay retry timeout')), 500)),
    ])
    assert.ok(navigations >= 2)
  } finally {
    plugin.destroy()
  }
})

test('hidden containers retain startIndex until their width becomes measurable', () => {
  for (const loop of [false, true]) {
    const { host, carousel } = mount(0, 5, {
      loop, slidesPerView: 2, startIndex: 3, transitionDuration: 0,
    })
    assert.equal(carousel.getIndex(), 3)
    host.width = 300
    ResizeObserver.flush()
    assert.equal(carousel.getIndex(), 3)
    carousel.destroy()
  }
})

test('loop replicas never replace the interactive original in view', () => {
  const probe = { name: 'position-probe', install(ctx) { this.context = ctx } }
  const { carousel, track } = mount(300, 3, {
    loop: true, slidesPerView: 3, transitionDuration: 0, plugins: [probe],
  })
  const original = track.children[0]
  const copy = track.children[3]
  let clicked = false
  original.addEventListener('click', () => { clicked = true })
  probe.context.setPositionDrag(150)
  assert.ok(original.style.transform.includes('translate3d(150px'))
  assert.ok(copy.style.transform.includes('translate3d(-150px'))
  original.dispatchEvent({ type: 'click' })
  assert.equal(clicked, true)
  carousel.destroy()
})

test('accessible region names update and CSS gap matches the layout', () => {
  const { carousel, host } = mount(300, 4, {
    ariaLabel: 'Featured products', gap: 12, transitionDuration: 0,
  })
  assert.equal(host.children[0].getAttribute('aria-label'), 'Featured products')
  assert.equal(host.children[0].style['--carousel-gap'], '12px')
  carousel.update({ ariaLabel: 'New arrivals', gap: 18 })
  assert.equal(host.children[0].getAttribute('aria-label'), 'New arrivals')
  assert.equal(host.children[0].style['--carousel-gap'], '18px')
  carousel.destroy()
})

test('reduced motion preferences suppress positional animations', () => {
  const originalMatchMedia = window.matchMedia
  window.matchMedia = query => ({
    matches: query.includes('prefers-reduced-motion'),
    addEventListener() {}, removeEventListener() {},
  })
  try {
    const { carousel } = mount(100, 4, { transitionDuration: 400 })
    carousel.next()
    assert.equal(carousel.getIndex(), 1)
    carousel.destroy()
  } finally {
    window.matchMedia = originalMatchMedia
  }
})

test('update re-invokes render functions and isolates their errors', () => {
  const host = new Element()
  host.width = 200
  let shouldThrow = false
  let renderCalls = 0
  const carousel = new Carousel(host, [{
    content: () => new Element('span'),
  }, {
    content: () => {
      renderCalls++
      if (shouldThrow) throw new Error('render failure')
      return new Element('span')
    },
  }], { transitionDuration: 0 })
  let failures = 0
  carousel.on('slide:error', ({ index, error }) => {
    if (index === 1 && error.message === 'render failure') failures++
  })
  shouldThrow = true
  carousel.update({ gap: 1 })
  assert.equal(renderCalls, 2)
  assert.equal(failures, 1)
  carousel.destroy()
})

test('initial render errors remain observable in console', () => {
  const original = console.error
  const messages = []
  console.error = (...args) => messages.push(args)
  try {
    const host = new Element()
    host.width = 100
    const carousel = new Carousel(host, [{
      content: () => { throw new Error('eager render failure') },
    }], { transitionDuration: 0 })
    assert.equal(messages.length, 1)
    assert.equal(messages[0][1].message, 'eager render failure')
    carousel.destroy()
  } finally {
    console.error = original
  }
})

test('visual replicas never duplicate application-owned element IDs', () => {
  const host = new Element()
  host.width = 200
  const carousel = new Carousel(host, [
    { content: () => {
      const element = new Element('div')
      element.setAttribute('id', 'slide-one-control')
      return element
    } },
    { content: () => new Element('div') },
  ], { loop: true, slidesPerView: 2, transitionDuration: 0 })
  const track = host.children[0].children[0].children[0]
  assert.equal(track.children[0].children[0].getAttribute('id'), 'slide-one-control')
  assert.equal(track.children[2].children[0].getAttribute('id'), null)
  carousel.update({ gap: 4 })
  assert.equal(track.children[2].children[0].getAttribute('id'), null)
  carousel.destroy()
})

test('breakpoint options reject nested breakpoint overrides', () => {
  const host = new Element()
  host.width = 200
  assert.throws(
    () => new Carousel(host, [{ content: 'one' }], {
      breakpoints: { 600: { breakpoints: { 1200: { gap: 10 } } } },
    }),
    TypeError,
  )
})

test('fractional multi-slide loops keep the viewport filled during wraparound', () => {
  const { carousel, track } = mount(300, 3, {
    loop: true,
    slidesPerView: 2.5,
    transitionDuration: 0,
  })
  assert.equal(track.children.length, 6)
  const logical = {
    name: 'layout-position-probe',
    install(ctx) { this.ctx = ctx },
  }
  carousel.use(logical)
  // Three 120px slides: moving 359px requires a second rendering of the
  // first visible slide to cover the rightmost 59px of the viewport.
  logical.ctx.setPositionDrag(359)
  const xs = track.children.map(el => Number.parseFloat(el.style.transform.slice(12)))
  for (let px = 0.5; px < 300; px += 1) {
    assert.ok(xs.some(x => x <= px && x + 120 >= px),
      'Uncovered pixel at ' + px + ' with slots ' + xs)
  }
  carousel.destroy()
})

test('long page swipes settle without an extra revolution', () => {
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  const { carousel, viewport } = mount(100, 5, {
    loop: true, slidesPerScroll: 2, transitionDuration: 100,
    plugins: [createSwipe({ threshold: 50 }), probe],
  })
  pointer(viewport, 'pointerup', -350)
  assert.equal(carousel.getIndex(), 4) // Visual index during an unsettled drag
  frame(120)
  assert.equal(carousel.getIndex(), 2)
  assert.equal(probe.ctx.getPosition(), 200)
  carousel.destroy()
})

test('autoplay stops on touch even if the user never changes slides', async () => {
  const autoplay = createAutoplay({
    interval: 5, pauseOnInteraction: true, pauseOnHover: false,
  })
  const { carousel, viewport } = mount(100, 5, {
    loop: true, transitionDuration: 400,
    plugins: [autoplay, createSwipe()],
  })
  try {
    await new Promise(resolve => carousel.once('transition:start', resolve))
    viewport.dispatchEvent({
      type: 'pointerdown', pointerId: 91, pointerType: 'touch',
      button: 0, isPrimary: true, clientX: 20, clientY: 20,
    })
    window.dispatchEvent({ type: 'pointerup', pointerId: 91, pointerType: 'touch' })
    assert.equal(autoplay.isActive(), false)
  } finally {
    carousel.destroy()
  }
})

test('autoplay resumes after a pointer interrupts an automatic transition', async () => {
  const autoplay = createAutoplay({
    interval: 5, pauseOnInteraction: false, pauseOnHover: false,
  })
  const { carousel, viewport } = mount(100, 5, {
    loop: true, transitionDuration: 400,
    plugins: [autoplay, createSwipe()],
  })
  try {
    const first = new Promise(resolve => carousel.once('transition:start', resolve))
    await first
    const again = new Promise(resolve => carousel.once('transition:start', resolve))
    viewport.dispatchEvent({
      type: 'pointerdown', pointerId: 92, pointerType: 'touch',
      button: 0, isPrimary: true, clientX: 40, clientY: 10,
    })
    window.dispatchEvent({ type: 'pointerup', pointerId: 92, pointerType: 'touch' })
    frame(500) // finish the gesture snap-back
    await Promise.race([
      again,
      new Promise((_, reject) => setTimeout(() => reject(new Error('autoplay stuck after pointer')), 250)),
    ])
    assert.equal(autoplay.isActive(), true)
  } finally {
    carousel.destroy()
  }
})

test('slide changes are not emitted with obsolete indexes after transition:end mutation', () => {
  const { carousel } = mount(100, 3, { transitionDuration: 0 })
  let completed = 0
  const changes = []
  carousel.on('transition:end', () => {
    completed++
    carousel.removeSlide(0)
  })
  carousel.on('slide:change', event => changes.push(event))
  carousel.goTo(1)
  assert.equal(completed, 1)
  assert.equal(carousel.getIndex(), 0)
  assert.equal(carousel.getSlide().content, '1')
  assert.equal(changes.length, 0)
  carousel.destroy()
})

test.after(() => { globalThis.performance = originalPerformance })

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
    frame(16)
    assert.equal(carousel.getIndex(), 3)
    carousel.destroy()
  }
})

test('destroy releases a pending observed resize without mutating the retired view', () => {
  const { host, carousel, track } = mount(100, 3, { transitionDuration: 0 })
  const slide = track.children[0]
  const beforeFrames = clock.frames.size
  let resized = 0
  carousel.on('resize', () => resized++)
  host.width = 320
  ResizeObserver.flush()
  carousel.destroy()
  const widthAfterDestroy = slide.style.width
  const notificationsAfterDestroy = resized
  assert.equal(clock.frames.size, beforeFrames)
  frame(16)
  assert.equal(slide.style.width, widthAfterDestroy)
  assert.equal(resized, notificationsAfterDestroy)
  assert.equal(host.children.length, 0)
})

test('rebuild releases an old pending observed resize and keeps the new layout', () => {
  const { host, carousel, track } = mount(100, 3, { startIndex: 1, transitionDuration: 0 })
  const beforeFrames = clock.frames.size
  host.width = 320
  ResizeObserver.flush()
  carousel.update({ slidesPerView: 2 })
  const indexAfterUpdate = carousel.getIndex()
  const widthsAfterUpdate = track.children.map(slide => slide.style.width)
  assert.equal(clock.frames.size, beforeFrames)
  frame(16)
  assert.equal(carousel.getIndex(), indexAfterUpdate)
  assert.deepEqual(widthsAfterUpdate, ['160px', '160px', '160px'])
  assert.deepEqual(track.children.map(slide => slide.style.width), widthsAfterUpdate)
  carousel.destroy()
})

test('rebuild before an observed resize frame keeps the most visible loop originals interactive', () => {
  const probe = { name: 'position-probe', install(ctx) { this.context = ctx } }
  const { host, carousel, track } = mount(640, 2, {
    loop: true, slidesPerView: 2, transitionDuration: 0, plugins: [probe],
  })
  host.width = 320
  ResizeObserver.flush()
  carousel.update({ gap: 0 })
  probe.context.setPositionDrag(200)
  // At 160px per slide, original #1 at -40 exposes 120px while its inert
  // replica at 280 exposes only 40px. The original must keep that wider slot.
  assert.equal(track.children[1].style.transform, 'translate3d(-40px, 0, 0)')
  assert.equal(track.children[3].style.transform, 'translate3d(280px, 0, 0)')
  frame(16)
  assert.equal(track.children[1].style.transform, 'translate3d(-40px, 0, 0)')
  carousel.destroy()
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

test('nested plugin installation cannot overwrite an in-progress registration', () => {
  const { carousel } = mount(100, 2, { transitionDuration: 0 })
  let nestedInstalled = 0
  let nestedDestroyed = 0
  let outerDestroyed = 0
  const nested = {
    name: 'duplicate', install() { nestedInstalled++ },
    destroy() { nestedDestroyed++ },
  }
  let caught = false
  const outer = {
    name: 'duplicate',
    install() {
      try { carousel.use(nested) } catch (error) {
        caught = error.message.includes('already installed')
      }
    },
    destroy() { outerDestroyed++ },
  }
  carousel.use(outer)
  assert.equal(caught, true)
  assert.equal(nestedInstalled, 0)
  assert.equal(carousel.getPlugin('duplicate'), outer)
  carousel.destroy()
  assert.equal(outerDestroyed, 1)
  assert.equal(nestedDestroyed, 0)
})

test('destroying during plugin install always rolls back the pending plugin', () => {
  const { carousel } = mount(100, 2, { transitionDuration: 0 })
  let destroyed = 0
  const plugin = {
    name: 'self-destruct',
    install() { carousel.destroy() },
    destroy() { destroyed++ },
  }
  let rejected = false
  try { carousel.use(plugin) } catch (error) {
    rejected = error.message.includes('destroyed while installing')
  }
  assert.equal(rejected, true)
  assert.equal(destroyed, 1)
  assert.equal(carousel.getPlugin('self-destruct'), undefined)
  const next = mount(100, 2, { transitionDuration: 0 })
  next.carousel.use(plugin) // Ownership of the failed install was released.
  next.carousel.destroy()
  assert.equal(destroyed, 2)
})

test.after(() => { globalThis.performance = originalPerformance })

test('fractional finite pages expose a stable final index and no further navigation', () => {
  const { carousel } = mount(280, 5, { slidesPerView: 2.8, transitionDuration: 0 })
  const changes = []
  carousel.on('slide:change', event => changes.push(event))
  carousel.goTo(3)
  assert.equal(carousel.getIndex(), 3)
  assert.equal(carousel.getSlide().content, '3')
  carousel.next()
  carousel.next()
  assert.equal(changes.length, 1)
  carousel.destroy()
})

test('repeating an animated destination preserves alignment and completion events', () => {
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  const { carousel } = mount(100, 5, { transitionDuration: 500, plugins: [probe] })
  const changes = []
  carousel.on('slide:change', event => changes.push(event))
  carousel.goTo(1)
  frame(170)
  assert.equal(carousel.getIndex(), 1)
  carousel.goTo(1)
  frame(600)
  assert.equal(probe.ctx.getPosition(), 100)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].prevIndex, 0)
  assert.equal(changes[0].index, 1)
  carousel.destroy()
})

test('cancelling a finite transition back to its origin settles without a false slide change', () => {
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  const { carousel } = mount(100, 5, { transitionDuration: 500, plugins: [probe] })
  const changes = []
  carousel.on('slide:change', event => changes.push(event))
  carousel.goTo(1)
  frame(50)
  assert.equal(carousel.getIndex(), 0)
  carousel.prev()
  frame(600)
  assert.equal(probe.ctx.getPosition(), 0)
  assert.deepEqual(changes, [])
  carousel.destroy()
})

test('retargeting a finite transition to its visible index notifies the settled destination', () => {
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  const { carousel } = mount(100, 5, { transitionDuration: 500, plugins: [probe] })
  const changes = []
  carousel.on('slide:change', event => changes.push(event))
  carousel.goTo(3)
  frame(70)
  assert.equal(carousel.getIndex(), 1)
  carousel.goTo(1)
  frame(600)
  assert.equal(probe.ctx.getPosition(), 100)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].prevIndex, 0)
  assert.equal(changes[0].index, 1)
  carousel.destroy()
})

test('consecutive observed resizes during navigation retain the initial coordinate system', () => {
  const { host, carousel } = mount(100, 6, { transitionDuration: 600 })
  carousel.goTo(3)
  host.width = 400
  ResizeObserver.flush()
  frame(20)
  host.width = 800
  ResizeObserver.flush()
  frame(20)
  frame(700)
  assert.equal(carousel.getIndex(), 3)
  carousel.destroy()
})

test('large loop scroll steps retain their modular destination before addition', () => {
  const { carousel } = mount(100, 5, {
    loop: true, slidesPerScroll: Number.MAX_SAFE_INTEGER, transitionDuration: 0,
  })
  try {
    carousel.goTo(2)
    carousel.next()
    assert.equal(carousel.getIndex(), 3)
    carousel.prev()
    assert.equal(carousel.getIndex(), 2)
  } finally {
    carousel.destroy()
  }
})

test('malformed breakpoint overrides are rejected before cloning normalizes them', () => {
  for (const override of [null, 1, [], 'unexpected']) {
    const host = new Element()
    host.width = 200
    assert.throws(() => new Carousel(host, [{ content: 'one' }], {
      breakpoints: { 600: override },
    }), TypeError)
  }
  const { carousel } = mount(200, 2)
  try {
    assert.throws(() => carousel.update({ breakpoints: { 600: null } }), TypeError)
    assert.equal(carousel.getIndex(), 0)
  } finally {
    carousel.destroy()
  }
})

test('once callbacks remain single-use when a preceding listener emits recursively', () => {
  const probe = { name: 'event-probe', install(ctx) { this.ctx = ctx } }
  const { carousel } = mount(100, 2, { transitionDuration: 0, plugins: [probe] })
  let nested = false
  let publicCalls = 0
  let pluginCalls = 0
  carousel.on('resize', () => {
    if (nested) return
    nested = true
    probe.ctx.emit('resize', { slidesPerView: 1 })
  })
  carousel.once('resize', () => publicCalls++)
  probe.ctx.once('resize', () => pluginCalls++)
  try {
    carousel.update({ gap: 1 })
    assert.equal(publicCalls, 1)
    assert.equal(pluginCalls, 1)
  } finally {
    carousel.destroy()
  }
})

test('tapping a settled fractional last page does not lock subsequent page navigation', () => {
  const { carousel, viewport } = mount(280, 5, {
    slidesPerView: 2.8, slidesPerScroll: 2, transitionDuration: 500,
    plugins: [createSwipe()],
  })
  try {
    carousel.goTo(3)
    frame(600)
    assert.equal(carousel.getIndex(), 3)
    pointer(viewport, 'pointerup', 0)
    carousel.prev()
    frame(600)
    assert.equal(carousel.getIndex(), 1)
  } finally {
    carousel.destroy()
  }
})

test('touch interruption consumes pending resize before starting gesture coordinates', () => {
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  const { carousel, viewport, host } = mount(100, 6, {
    transitionDuration: 600, plugins: [createSwipe(), probe],
  })
  const changes = []
  carousel.on('slide:change', event => changes.push(event))
  try {
    carousel.goTo(3)
    host.width = 400
    ResizeObserver.flush()
    frame(80)
    const indexAtInterruption = carousel.getIndex()
    assert.equal(indexAtInterruption, 1)
    pointer(viewport, 'pointerup', 0)
    frame(700)
    assert.equal(carousel.getIndex(), indexAtInterruption)
    assert.equal(probe.ctx.getPosition(), indexAtInterruption * probe.ctx.getStep())
    assert.deepEqual(changes, [])
    pointer(viewport, 'pointerup', -60)
    frame(700)
    assert.equal(carousel.getIndex(), indexAtInterruption + 1)
    assert.equal(changes.length, 1)
  } finally {
    carousel.destroy()
  }
})

test('a qualifying swipe after pending resize uses the rescaled gesture origin', () => {
  const { carousel, viewport, host } = mount(100, 6, {
    transitionDuration: 600, plugins: [createSwipe()],
  })
  const changes = []
  carousel.on('slide:change', event => changes.push(event))
  try {
    carousel.goTo(3)
    host.width = 400
    ResizeObserver.flush()
    frame(80)
    assert.equal(carousel.getIndex(), 1)
    pointer(viewport, 'pointerup', -60)
    frame(700)
    assert.equal(carousel.getIndex(), 2)
    assert.equal(changes.length, 1)
    assert.equal(changes[0].prevIndex, 1)
    assert.equal(changes[0].index, 2)
  } finally {
    carousel.destroy()
  }
})

for (const [transition, count] of [['stairs', 8], ['pixel', 64], ['curtain', 2]]) {
  test(`${transition} commits a fractional loop destination only while the viewport is fully covered`, () => {
    const { carousel, viewport } = mount(300, 5, {
      loop: true, slidesPerView: 2.5, transition, transitionDuration: 200,
    })
    const events = []
    carousel.on('transition:start', () => events.push('start'))
    carousel.on('transition:end', ({ index }) => events.push(`end:${index}`))
    carousel.on('slide:change', ({ index, prevIndex }) => events.push(`change:${prevIndex}:${index}`))
    try {
      carousel.goTo(3)
      const overlay = viewport.querySelector('.carousel__transition')
      assert.ok(overlay)
      assert.equal(overlay.dataset.transition, transition)
      assert.equal(overlay.children.length, count)
      assert.equal(overlay.getAttribute('aria-hidden'), 'true')
      assert.equal(overlay.inert, true)
      assert.equal(overlay.style.pointerEvents, 'none')
      assert.equal(carousel.getIndex(), 0)
      frame(99)
      assert.equal(carousel.getIndex(), 0)
      frame(1)
      assert.equal(carousel.getIndex(), 3)
      for (const panel of overlay.children) {
        assert.equal(panel.style.opacity, '1')
        assert.equal(panel.style.transform, 'translate3d(0%, 0%, 0)')
      }
      assert.deepEqual(events, ['start'])
      frame(100)
      assert.equal(viewport.querySelector('.carousel__transition'), null)
      assert.deepEqual(events, ['start', 'end:3', 'change:0:3'])
    } finally {
      carousel.destroy()
    }
  })

  test(`${transition} has no decorative work at zero duration or with reduced motion`, () => {
    const matchMedia = window.matchMedia
    try {
      for (const reduced of [false, true]) {
        window.matchMedia = query => ({
          matches: reduced && query.includes('prefers-reduced-motion'),
          addEventListener() {}, removeEventListener() {},
        })
        const before = clock.frames.size
        const { carousel, viewport } = mount(100, 4, {
          transition, transitionDuration: reduced ? 500 : 0,
        })
        let completed = 0
        carousel.on('transition:end', () => completed++)
        carousel.goTo(2)
        assert.equal(carousel.getIndex(), 2)
        assert.equal(viewport.querySelector('.carousel__transition'), null)
        assert.equal(completed, 1)
        assert.equal(clock.frames.size, before)
        carousel.destroy()
      }
    } finally {
      window.matchMedia = matchMedia
    }
  })

  test(`${transition} retires its timeline after update, destroy, or touch takeover`, () => {
    for (const action of ['update', 'destroy', 'touch-before', 'touch-after']) {
      const before = clock.frames.size
      const { carousel, viewport } = mount(100, 5, {
        transition, transitionDuration: 200, plugins: [createSwipe()],
      })
      let completed = 0
      let changes = 0
      carousel.on('transition:end', () => completed++)
      carousel.on('slide:change', () => changes++)
      carousel.goTo(3)
      frame(action === 'touch-after' ? 120 : 50)
      const visible = carousel.getIndex()
      if (action === 'update') carousel.update({ gap: 3 })
      else if (action === 'destroy') carousel.destroy()
      else pointer(viewport, 'pointerup', 0)
      assert.equal(viewport.querySelector('.carousel__transition'), null)
      frame(300)
      assert.equal(completed, 0)
      assert.equal(changes, 0)
      if (action !== 'destroy') assert.equal(carousel.getIndex(), visible)
      carousel.destroy()
      assert.equal(clock.frames.size, before)
    }
  })

  test(`${transition} settles the intended partial page exactly once when its viewport resizes`, () => {
    const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
    const { carousel, host, viewport } = mount(280, 5, {
      slidesPerView: 2.8, transition, transitionDuration: 200, plugins: [probe],
    })
    const events = []
    carousel.on('resize', () => events.push('resize'))
    carousel.on('transition:end', ({ index }) => events.push(`end:${index}`))
    carousel.on('slide:change', ({ index }) => events.push(`change:${index}`))
    try {
      carousel.goTo(3)
      frame(50)
      host.width = 560
      ResizeObserver.flush()
      frame(16)
      assert.equal(viewport.querySelector('.carousel__transition'), null)
      assert.equal(carousel.getIndex(), 3)
      assert.ok(Math.abs(probe.ctx.getPosition() - 440) < 0.001)
      assert.deepEqual(events, ['resize', 'end:3', 'change:3'])
      frame(300)
      assert.deepEqual(events, ['resize', 'end:3', 'change:3'])
    } finally {
      carousel.destroy()
    }
  })
}

for (const transition of ['stairs', 'pixel', 'curtain']) {
  test(`${transition} keeps the commit frame covered until incoming parallax is synchronized`, () => {
    const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
    const { carousel, viewport, track } = mount(100, 5, {
      transition, transitionDuration: 200, plugins: [createParallax(), probe],
    })
    try {
      const incoming = track.children[4].querySelector('.carousel__parallax__layer')
      carousel.goTo(4)
      frame(110)
      assert.equal(probe.ctx.getPosition(), 400)
      assert.equal(incoming.style.transform, 'translateX(-80%)')
      const overlay = viewport.querySelector('.carousel__transition')
      for (const panel of overlay.children) {
        assert.equal(panel.style.transform, 'translate3d(0%, 0%, 0)')
        assert.equal(panel.style.opacity, '1')
      }
      frame(16)
      assert.equal(incoming.style.transform, 'translateX(0%)')
      assert.ok(overlay.children.some(panel => panel.style.opacity !== '1'
        || panel.style.transform !== 'translate3d(0%, 0%, 0)'))
      frame(74)
      assert.equal(viewport.querySelector('.carousel__transition'), null)
      assert.equal(carousel.getIndex(), 4)
    } finally {
      carousel.destroy()
    }
  })
}

test('a decorative transition timer fallback synchronizes parallax without waiting for another frame', { timeout: 1000 }, async () => {
  const { carousel, viewport, track } = mount(100, 5, {
    transition: 'pixel', transitionDuration: 5, plugins: [createParallax()],
  })
  try {
    const completed = new Promise(resolve => carousel.once('transition:end', resolve))
    carousel.goTo(4)
    await completed
    assert.equal(carousel.getIndex(), 4)
    assert.equal(viewport.querySelector('.carousel__transition'), null)
    assert.equal(track.children[4].querySelector('.carousel__parallax__layer').style.transform, 'translateX(0%)')
  } finally {
    carousel.destroy()
  }
})

for (const transition of ['slide', 'fade']) {
  for (const scenario of [
    { name: 'finite final slide', slidesPerView: 1, loop: false, target: 4, widths: [200] },
    { name: 'finite final slide after growing', slidesPerView: 1, loop: false, target: 4, widths: [800, 200] },
    { name: 'fractional finite final page', slidesPerView: 2.8, loop: false, target: 3, widths: [200] },
    { name: 'fractional loop destination', slidesPerView: 2.5, loop: true, target: 4, widths: [800, 200] },
  ]) {
    test(`${transition} retains its ${scenario.name} when a pending resize shrinks the viewport`, { timeout: 1000 }, async () => {
      const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
      const { host, carousel } = mount(400, 5, {
        transition, transitionDuration: 120, plugins: [probe],
        slidesPerView: scenario.slidesPerView, loop: scenario.loop,
      })
      const events = []
      carousel.on('transition:start', ({ toIndex }) => events.push(`start:${toIndex}`))
      carousel.on('resize', () => events.push('resize'))
      carousel.on('transition:end', ({ index }) => events.push(`end:${index}`))
      carousel.on('slide:change', ({ index, prevIndex }) => events.push(`change:${prevIndex}:${index}`))
      try {
        const completed = new Promise(resolve => carousel.once('transition:end', resolve))
        carousel.goTo(scenario.target)
        for (const width of scenario.widths) {
          host.width = width
          ResizeObserver.flush()
          frame(16)
        }
        frame(200)
        // Single-slide fade completes through its CSS fallback timer.
        await completed
        assert.equal(carousel.getIndex(), scenario.target)
        const expectedPosition = (scenario.loop
          ? scenario.target
          : Math.min(scenario.target, 5 - scenario.slidesPerView)) * probe.ctx.getStep()
        assert.ok(Math.abs(probe.ctx.getPosition() - expectedPosition) < 0.001)
        frame(200)
        assert.deepEqual(events, [
          `start:${scenario.target}`, 'resize', `end:${scenario.target}`, `change:0:${scenario.target}`,
        ])
      } finally {
        carousel.destroy()
      }
    })
  }
}

for (const slidesPerView of [1, 2.8]) {
  test(`snap-back retains its final page after a pending shrink with slidesPerView ${slidesPerView}`, () => {
    const target = Math.ceil(5 - slidesPerView)
    const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
    const { host, carousel } = mount(400, 5, {
      startIndex: target, slidesPerView, transitionDuration: 120, plugins: [probe],
    })
    const events = []
    carousel.on('resize', () => events.push('resize'))
    carousel.on('transition:end', () => events.push('end'))
    carousel.on('slide:change', () => events.push('change'))
    try {
      probe.ctx.setPositionDrag(probe.ctx.getPosition() - 30)
      probe.ctx.snapBack(target)
      host.width = 200
      ResizeObserver.flush()
      frame(16)
      frame(200)
      assert.equal(carousel.getIndex(), target)
      assert.ok(Math.abs(probe.ctx.getPosition() - (5 - slidesPerView) * probe.ctx.getStep()) < 0.001)
      assert.deepEqual(events, ['resize'])
    } finally {
      carousel.destroy()
    }
  })
}

test('a pending shrink handler can update or destroy without publishing obsolete navigation events', () => {
  for (const action of ['update', 'destroy']) {
    const { host, carousel } = mount(400, 5, { transitionDuration: 120 })
    const events = []
    carousel.on('transition:end', () => events.push('end'))
    carousel.on('slide:change', () => events.push('change'))
    carousel.once('resize', () => {
      if (action === 'update') carousel.update({ gap: 2 })
      else carousel.destroy()
    })
    try {
      carousel.goTo(4)
      host.width = 200
      ResizeObserver.flush()
      frame(16)
      frame(200)
      assert.deepEqual(events, [])
      if (action === 'update') assert.equal(carousel.getIndex(), 4)
    } finally {
      carousel.destroy()
    }
  }
})

for (const scenario of [
  { name: 'finite navigation', loop: false, transition: 'slide', duration: 0 },
  { name: 'loop navigation', loop: true, transition: 'slide', duration: 0 },
  { name: 'decorative navigation', loop: false, transition: 'pixel', duration: 180 },
]) {
  test(`render-triggered ${scenario.name} waits for the rebuilt geometry`, async () => {
    const host = new Element()
    host.width = 100
    const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
    let carousel
    let calls = 0
    const slides = [
      { content: () => {
        if (++calls === 2) carousel.goTo(1)
        return new Element('article')
      } },
      ...Array.from({ length: 3 }, (_, index) => ({ content: String(index + 1) })),
    ]
    carousel = new Carousel(host, slides, {
      loop: scenario.loop, transition: scenario.transition,
      transitionDuration: scenario.duration, plugins: [probe],
    })
    const events = []
    carousel.on('resize', () => events.push('resize'))
    carousel.on('transition:start', ({ toIndex }) => events.push(`start:${toIndex}`))
    carousel.on('transition:end', ({ index }) => events.push(`end:${index}`))
    carousel.on('slide:change', ({ index, prevIndex }) => events.push(`change:${prevIndex}:${index}`))
    try {
      carousel.update({ slidesPerView: 2, gap: 10 })
      const eventsAfterUpdate = [...events]
      await Promise.resolve()
      frame(200)
      assert.equal(carousel.getIndex(), 1)
      assert.equal(probe.ctx.getStep(), 55)
      assert.equal(probe.ctx.getPosition(), 55)
      assert.equal(calls, 2, 'deferred navigation must not rebuild slide content again')
      assert.deepEqual(eventsAfterUpdate, ['resize'])
      assert.deepEqual(events, ['resize', 'start:1', 'end:1', 'change:0:1'])
    } finally {
      carousel.destroy()
    }
  })
}

test('navigation from a render error waits for the rebuilt geometry', async () => {
  const host = new Element()
  host.width = 100
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  let calls = 0
  const carousel = new Carousel(host, [
    { content: () => {
      if (++calls === 2) throw new Error('refresh failed')
      return new Element('article')
    } },
    { content: 'Second' }, { content: 'Third' }, { content: 'Fourth' },
  ], { transitionDuration: 0, plugins: [probe] })
  const events = []
  carousel.on('slide:error', () => { events.push('error'); carousel.goTo(1) })
  carousel.on('resize', () => events.push('resize'))
  carousel.on('slide:change', ({ index }) => events.push(`change:${index}`))
  try {
    carousel.update({ slidesPerView: 2 })
    await Promise.resolve()
    assert.equal(carousel.getIndex(), 1)
    assert.equal(probe.ctx.getPosition(), 50)
    assert.deepEqual(events, ['error', 'resize', 'change:1'])
  } finally {
    carousel.destroy()
  }
})

test('nested rebuilds defer the last navigation request until the newest layout is ready', async () => {
  const host = new Element()
  host.width = 300
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  let carousel
  let calls = 0
  carousel = new Carousel(host, [
    { content: () => {
      if (++calls === 2) {
        carousel.goTo(1)
        carousel.update({ slidesPerView: 3, gap: 6 })
      }
      return new Element('article')
    } },
    ...Array.from({ length: 4 }, (_, index) => ({ content: String(index + 1) })),
  ], { transitionDuration: 0, plugins: [probe] })
  const events = []
  carousel.on('resize', () => { events.push('resize'); carousel.goTo(2) })
  carousel.on('transition:start', ({ toIndex }) => events.push(`start:${toIndex}`))
  carousel.on('slide:change', ({ index }) => events.push(`change:${index}`))
  try {
    carousel.update({ slidesPerView: 2 })
    await Promise.resolve()
    assert.equal(carousel.getIndex(), 2)
    assert.equal(probe.ctx.getStep(), 102)
    assert.equal(probe.ctx.getPosition(), 204)
    assert.equal(calls, 3)
    assert.deepEqual(events, ['resize', 'start:2', 'change:2'])
  } finally {
    carousel.destroy()
  }
})

test('destroy during a render callback cancels its queued navigation', async () => {
  const host = new Element()
  host.width = 100
  let carousel
  let calls = 0
  carousel = new Carousel(host, [
    { content: () => {
      if (++calls === 2) {
        carousel.goTo(1)
        carousel.destroy()
      }
      return new Element('article')
    } },
    { content: 'Second' }, { content: 'Third' },
  ], { transitionDuration: 0 })
  const events = []
  carousel.on('transition:start', () => events.push('start'))
  carousel.on('slide:change', () => events.push('change'))
  try {
    carousel.update({ slidesPerView: 2 })
    await Promise.resolve()
    assert.equal(host.children.length, 0)
    assert.deepEqual(events, [])
  } finally {
    carousel.destroy()
  }
})

test('a rebuild inside beforeChange retains the outer navigation batch', async () => {
  const { carousel } = mount(100, 4, { transitionDuration: 0 })
  const events = []
  carousel.on('slide:beforeChange', ({ toIndex }) => {
    if (toIndex === 1) carousel.update({ slidesPerView: 2 })
  })
  carousel.on('slide:beforeChange', ({ toIndex }) => {
    if (toIndex === 1) carousel.goTo(2)
  })
  carousel.on('transition:start', ({ toIndex }) => events.push(`start:${toIndex}`))
  carousel.on('slide:change', ({ index }) => events.push(`change:${index}`))
  try {
    carousel.goTo(1)
    assert.equal(carousel.getIndex(), 0)
    assert.deepEqual(events, [])
    await Promise.resolve()
    assert.equal(carousel.getIndex(), 2)
    assert.deepEqual(events, ['start:2', 'change:2'])
  } finally {
    carousel.destroy()
  }
})

for (const target of [0, 2]) {
  test(`a newer navigation to ${target} supersedes the request queued during a rebuild`, async () => {
    const host = new Element()
    host.width = 100
    const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
    let carousel
    let calls = 0
    carousel = new Carousel(host, [
      { content: () => {
        if (++calls === 2) carousel.goTo(1)
        return new Element('article')
      } },
      { content: 'Second' }, { content: 'Third' }, { content: 'Fourth' },
    ], { transitionDuration: 0, plugins: [probe] })
    const changes = []
    carousel.on('slide:change', ({ index }) => changes.push(index))
    try {
      carousel.update({ slidesPerView: 2 })
      carousel.goTo(target)
      assert.equal(carousel.getIndex(), target)
      await Promise.resolve()
      assert.equal(carousel.getIndex(), target)
      assert.equal(probe.ctx.getPosition(), target * probe.ctx.getStep())
      assert.deepEqual(changes, target === 0 ? [] : [target])
    } finally {
      carousel.destroy()
    }
  })
}

for (const [action, target] of [['next', 4], ['prev', 2]]) {
  test(`${action} from an inserted slide renderer uses the preserved current slide`, async () => {
    const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
    const { carousel } = mount(100, 5, { startIndex: 2, transitionDuration: 0, plugins: [probe] })
    const changes = []
    carousel.on('slide:change', ({ index, prevIndex }) => changes.push({ index, prevIndex }))
    try {
      carousel.addSlide({ content: () => {
        carousel[action]()
        return new Element('article')
      } }, 0)
      assert.equal(carousel.getIndex(), 3)
      await Promise.resolve()
      assert.equal(carousel.getIndex(), target)
      assert.equal(probe.ctx.getPosition(), target * probe.ctx.getStep())
      assert.deepEqual(changes, [{ index: target, prevIndex: 3 }])
    } finally {
      carousel.destroy()
    }
  })
}

for (const [action, target, changes] of [['next', 3, [3]], ['prev', 1, [3, 1]]]) {
  test(`${action} from beforeChange keeps its existing event-batch target semantics`, async () => {
    const { carousel } = mount(100, 5, { startIndex: 2, transitionDuration: 0 })
    const actual = []
    carousel.on('slide:beforeChange', ({ toIndex }) => {
      if (toIndex === 3) carousel[action]()
    })
    carousel.on('slide:change', ({ index }) => actual.push(index))
    try {
      carousel.goTo(3)
      await Promise.resolve()
      assert.equal(carousel.getIndex(), target)
      assert.deepEqual(actual, changes)
    } finally {
      carousel.destroy()
    }
  })
}

test('resize callbacks resolve relative targets from their already normalized layout', async () => {
  const probe = { name: 'position-probe', install(ctx) { this.ctx = ctx } }
  const { carousel } = mount(100, 5, { startIndex: 3, transitionDuration: 0, plugins: [probe] })
  const changes = []
  carousel.on('slide:change', ({ index }) => changes.push(index))
  carousel.once('resize', () => {
    carousel.prev()
    carousel.update({ slidesPerView: 4 })
  })
  try {
    carousel.update({ gap: 4 })
    await Promise.resolve()
    assert.equal(carousel.getIndex(), 1)
    assert.equal(probe.ctx.getPosition(), probe.ctx.getStep())
    assert.deepEqual(changes, [])
  } finally {
    carousel.destroy()
  }
})

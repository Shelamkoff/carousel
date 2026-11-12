import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { Carousel } from '../src/Carousel.js'
import { createAutoplay } from '../src/plugins/autoplay.js'
import { createParallax } from '../src/plugins/parallax.js'

// Exercise the real Carousel subscription scope and EventBus. This small DOM
// fixture supplies only layout, tree operations and the clock used by parallax.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
    this.style = { setProperty(name, value) { this[name] = value } }
    this.dataset = {}
    this.children = []
    this.parentNode = null
    this.attributes = new Map()
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
  get childNodes() { return this.children }
  get firstChild() { return this.children[0] ?? null }
  get offsetWidth() { return 100 }
  get offsetHeight() { return 20 }
  get scrollHeight() { return 20 }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  appendChild(node) { return this.insertBefore(node, null) }
  insertBefore(node, reference) {
    node.remove()
    const index = reference ? this.children.indexOf(reference) : -1
    if (index < 0) this.children.push(node)
    else this.children.splice(index, 0, node)
    node.parentNode = this
    return node
  }
  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.children.indexOf(this)
    if (index >= 0) this.parentNode.children.splice(index, 1)
    this.parentNode = null
  }
  replaceChildren(...nodes) {
    for (const node of [...this.children]) node.remove()
    for (const node of nodes) this.appendChild(node)
  }
  set innerHTML(value) { this.replaceChildren(); this.markup = value }
  querySelector(selector) {
    const className = selector.slice(1)
    for (const child of this.children) {
      if (child.classList.contains(className)) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
  addEventListener() {}
  removeEventListener() {}
}

const globalKeys = ['HTMLElement', 'document', 'window', 'ResizeObserver', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame']
const originalGlobals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
after(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})
const clock = { now: 0, next: 0, frames: new Map() }
globalThis.HTMLElement = Element
globalThis.document = { createElement: tag => new Element(tag) }
globalThis.window = new Element('window')
globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
globalThis.performance = { now: () => clock.now }
globalThis.requestAnimationFrame = callback => {
  const id = ++clock.next
  clock.frames.set(id, callback)
  return id
}
globalThis.cancelAnimationFrame = id => clock.frames.delete(id)

function frame(ms) {
  clock.now += ms
  // Keep cancelled callbacks out of an already collected frame batch.
  for (const [id, callback] of [...clock.frames]) {
    if (!clock.frames.delete(id)) continue
    callback(clock.now)
  }
}

function mount(t, plugins = []) {
  const host = new Element()
  const carousel = new Carousel(host, Array.from({ length: 3 }, () => ({
    content: () => new Element('article'),
  })), { transitionDuration: 200, plugins })
  t.after(() => carousel.destroy())
  return { carousel, host, track: host.querySelector('.carousel__track') }
}

test('destroy during transition:start leaves no retired parallax work and permits plugin reuse', t => {
  const plugin = createParallax()
  const first = mount(t)
  first.carousel.on('transition:start', () => first.carousel.destroy())
  first.carousel.use(plugin)
  first.carousel.next()
  const pendingAfterDestroy = clock.frames.size
  frame(20)

  const second = mount(t, [plugin])
  const layer = second.track.children[1].querySelector('.carousel__parallax__layer')
  const before = layer.style.transform
  second.carousel.next()
  frame(50)
  frame(50)

  assert.deepEqual({ pendingAfterDestroy, layerMoved: layer.style.transform !== before }, {
    pendingAfterDestroy: 0,
    layerMoved: true,
  })
})

for (const event of ['transition:end', 'resize']) {
  test(`retired ${event} handlers cannot stop parallax on a new carousel owner`, t => {
    const plugin = createParallax()
    const first = mount(t)
    const second = mount(t)
    first.carousel.on(event, () => {
      first.carousel.destroy()
      second.carousel.use(plugin)
      second.carousel.next()
    })
    first.carousel.use(plugin)

    if (event === 'transition:end') {
      first.carousel.next()
      frame(200)
    } else {
      first.carousel.update({ gap: 1 })
    }
    const layer = second.track.children[1].querySelector('.carousel__parallax__layer')
    const before = layer.style.transform
    frame(50)
    frame(50)
    assert.notEqual(layer.style.transform, before, 'the new owner must keep its active parallax clock')
  })
}

test('an owned handler unsubscribed during an event batch is not invoked from its stale snapshot', t => {
  const { carousel } = mount(t)
  let unsubscribe
  let calls = 0
  carousel.on('slide:beforeChange', () => unsubscribe())
  carousel.use({
    name: 'unsubscribe-during-dispatch',
    install(context) {
      unsubscribe = context.on('slide:beforeChange', () => calls++)
    },
  })
  carousel.next()
  assert.equal(calls, 0)
})

test('plugin render listeners cannot receive an obsolete frame after a nested rebuild', t => {
  const { carousel } = mount(t)
  let changed = false
  carousel.on('render', state => {
    if (changed || state.phase !== 'animation') return
    changed = true
    carousel.update({ gap: 8 })
  })
  const frames = []
  carousel.use({ name: 'frame-observer', install(context) {
    context.on('render', state => frames.push(state))
  } })

  carousel.next()

  assert.equal(frames.length, 1)
  assert.equal(frames[0], carousel.getRenderState())
  assert.equal(frames[0].phase, 'idle')
})

test('a nested rebuild retires the outer reset before later plugin cleanup', t => {
  const { carousel } = mount(t)
  let changed = false
  carousel.on('render:reset', () => {
    if (changed) return
    changed = true
    carousel.setSlides([{ content: 'Replacement' }])
  })
  const notifications = []
  carousel.use({ name: 'reset-observer', install(context) {
    context.on('render:reset', () => notifications.push('reset'))
    context.on('render', () => notifications.push('render'))
  } })

  carousel.update({ gap: 8 })

  assert.deepEqual(notifications, ['reset', 'render'])
  assert.equal(carousel.getSlideCount(), 1)
})

test('owned subscriptions retain EventBus deduplication for the same event and callback', t => {
  const { carousel } = mount(t)
  let context
  carousel.use({ name: 'deduplication', install(value) { context = value } })
  let calls = 0
  const handler = () => calls++
  const first = context.on('resize', handler)
  const second = context.on('resize', handler)
  context.emit('resize', { slidesPerView: 1 })
  assert.equal(calls, 1)
  first()
  context.emit('resize', { slidesPerView: 1 })
  assert.equal(calls, 1)
  second()
})

test('an owned once callback is removed before it emits the same event recursively', t => {
  const { carousel } = mount(t)
  let context
  carousel.use({ name: 'once-recursion', install(value) { context = value } })
  let calls = 0
  context.once('resize', () => {
    calls++
    if (calls < 2) context.emit('resize', { slidesPerView: 1 })
  })
  context.emit('resize', { slidesPerView: 1 })
  assert.equal(calls, 1)
})

test('a retired plugin context cannot register new event work after cleanup', t => {
  const { carousel } = mount(t)
  let context
  carousel.use({ name: 'retired-context', install(value) { context = value } })
  carousel.destroy()
  let calls = 0
  const unsubscribe = context.on('resize', () => calls++)
  context.emit('resize', { slidesPerView: 1 })
  assert.equal(calls, 0)
  assert.equal(typeof unsubscribe, 'function')
  unsubscribe()
})

test('plugin visual element arrays cannot mutate the internal slide mapping', t => {
  const { carousel } = mount(t)
  let context
  carousel.use({ name: 'visual-array-consumer', install(value) { context = value } })
  const originals = carousel.getSlideElements()
  const visual = context.getVisualElements()

  visual.reverse()
  assert.ok(carousel.getSlideElement(0) === originals[0],
    'sorting a visual element list must not reorder the internal mapping')
  visual.length = 0
  assert.equal(carousel.getSlideElements().length, originals.length)
  carousel.updateSlide(0, { meta: { revised: true } })
  assert.ok(carousel.getSlideElement(0) === originals[0],
    'a metadata update must retain the original content owner')
})

test('autoplay teardown notifies application listeners and plugins whose scope is still live', t => {
  const stops = { application: 0, plugin: 0 }
  const observer = {
    name: 'autoplay-stop-observer',
    install(context) {
      context.on('autoplay:stop', () => stops.plugin++)
    },
  }
  const autoplay = createAutoplay({ interval: 60_000 })
  // Plugins are destroyed in reverse order, so the observer is still installed
  // while autoplay publishes its normal stop notification.
  const { carousel } = mount(t, [observer, autoplay])
  carousel.on('autoplay:stop', () => stops.application++)
  carousel.destroy()
  carousel.destroy()
  assert.deepEqual(stops, { application: 1, plugin: 1 })
  assert.equal(autoplay.isActive(), false)
})

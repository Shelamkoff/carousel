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
    this.nodeType = 1
    this.localName = tag.toLowerCase()
    this.namespaceURI = 'http://www.w3.org/1999/xhtml'
    this.style = { setProperty(name, value) { this[name] = value } }
    this.dataset = {}
    this.children = []
    this.parentNode = null
    this.attributeValues = new Map()
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
  get attributes() {
    const attributes = new Map(this.attributeValues)
    attributes.set('class', this.className)
    for (const [key, value] of Object.entries(this.dataset)) {
      attributes.set(`data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value)
    }
    return [...attributes].map(([name, value]) => ({ name, value, namespaceURI: null }))
  }
  hasAttribute(name) { return this.getAttribute(name) !== null }
  get id() { return this.getAttribute('id') ?? '' }
  set id(value) { this.setAttribute('id', value) }
  get className() { return [...this.classes].join(' ') }
  set className(value) { this.classes = new Set(value.split(' ').filter(Boolean)) }
  get childNodes() { return this.children }
  get firstChild() { return this.children[0] ?? null }
  get firstElementChild() { return this.children[0] ?? null }
  get nextElementSibling() {
    return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null
  }
  get offsetWidth() { return 100 }
  get offsetHeight() { return 20 }
  get scrollHeight() { return 20 }
  setAttribute(name, value) {
    this.attributeValues.set(name, String(value))
    if (name === 'class') this.className = String(value)
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value)
  }
  getAttribute(name) { return this.attributeValues.get(name) ?? null }
  removeAttribute(name) { this.attributeValues.delete(name) }
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
globalThis.document = { createElement: tag => new Element(tag), getElementById: () => null }
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

test('an asynchronous plugin install fails synchronously and revokes partial setup', async t => {
  const { carousel } = mount(t)
  let context, cleanup = 0, callbacks = 0
  const plugin = {
    name: 'async-install',
    async install(ctx) {
      context = ctx
      ctx.on('resize', () => { callbacks++ })
      throw new Error('rejected install')
    },
    destroy() { cleanup++ },
  }
  assert.throws(() => carousel.use(plugin), /install\(\) must be synchronous/)
  assert.equal(carousel.getPlugin(plugin.name), undefined)
  assert.equal(cleanup, 1)
  carousel.update({ gap: 4 })
  context.next()
  await Promise.resolve()
  assert.equal(callbacks, 0)
  assert.equal(carousel.getIndex(), 0)

  plugin.install = () => {}
  assert.equal(carousel.use(plugin), carousel, 'rollback releases the plugin instance for reuse')
})

test('an asynchronous plugin destroy still retires its scope and consumes rejection', async t => {
  let context
  const plugin = {
    name: 'async-destroy',
    install(ctx) { context = ctx },
    async destroy() { throw new Error('rejected destroy') },
  }
  const { carousel } = mount(t, [plugin])
  assert.throws(() => carousel.unuse(plugin.name), /destroy\(\) must be synchronous/)
  assert.equal(carousel.getPlugin(plugin.name), undefined)
  context.next()
  await Promise.resolve()
  assert.equal(carousel.getIndex(), 0)

  plugin.destroy = () => {}
  assert.equal(carousel.use(plugin), carousel)
})

test('rollback consumes asynchronous cleanup rejection while preserving the install error', async t => {
  const { carousel } = mount(t)
  const original = new Error('synchronous installation failure')
  assert.throws(() => carousel.use({
    name: 'failed-install',
    install() { throw original },
    async destroy() { throw new Error('cleanup failure') },
  }), error => error === original)
  await Promise.resolve()
  assert.equal(carousel.getPlugin('failed-install'), undefined)
})

test('point reset scopes are immutable and full rebuilds retain the unscoped contract', t => {
  const { carousel } = mount(t)
  const scopes = []
  carousel.on('render:reset', scope => scopes.push(scope))
  carousel.updateSlide(1, { content: () => new Element('input') })
  carousel.refresh(2)
  carousel.update({ gap: 8 })

  assert.deepEqual(scopes, [{ indices: [1] }, { indices: [2] }, undefined])
  assert.equal(Object.isFrozen(scopes[0]), true)
  assert.equal(Object.isFrozen(scopes[0].indices), true)
})

test('nested point resets cover an outer update whose reset callbacks are superseded', t => {
  let context
  const { carousel } = mount(t, [{ name: 'reset-observer', install(ctx) { context = ctx } }])
  carousel.updateSlide(2, { lazy: true, content: () => new Element('input') })
  const scopes = []
  carousel.once('render:reset', () => context.renderSlide(2))
  context.on('render:reset', scope => scopes.push(scope))

  carousel.updateSlide(1, { content: () => new Element('textarea') })

  assert.deepEqual(scopes, [undefined], 'the nested full reset also covers the outer changed slide')
  assert.equal(carousel.getSlideElement(1).firstChild.tagName, 'TEXTAREA')
  assert.equal(carousel.getSlideElement(2).firstChild.tagName, 'INPUT')
})

test('motion idle covers navigation and snapback without constructing render snapshots', async t => {
  let context
  const { carousel } = mount(t, [{ name: 'motion-observer', install(ctx) { context = ctx } }])
  const events = []
  carousel.on('motion:idle', payload => events.push(payload))
  carousel.getRenderState = () => { throw new Error('idle observers must not require per-slide snapshots') }

  carousel.next()
  frame(200)
  assert.equal(events.length, 0, 'idle notifications wait until synchronous callbacks finish')
  await Promise.resolve()
  assert.deepEqual(events, [{ index: 1, position: 100, reason: 'complete' }])

  context.setPositionDrag(125)
  context.snapBack(1)
  frame(200)
  await Promise.resolve()
  assert.deepEqual(events.at(-1), { index: 1, position: 100, reason: 'complete' })
  assert.equal(events.length, 2, 'snapback publishes its own completion without a slide change')
})

test('motion cancellation reports the final coordinate once without pretending navigation completed', async t => {
  let context
  const { carousel } = mount(t, [{ name: 'motion-observer', install(ctx) { context = ctx } }])
  const events = []
  let completions = 0
  carousel.on('motion:idle', payload => events.push(payload))
  carousel.on('transition:end', () => { completions++ })
  carousel.next()
  frame(50)
  context.stopAnimation()
  context.setPosition(20)
  context.stopAnimation()
  await Promise.resolve()

  assert.deepEqual(events, [{ index: 0, position: 20, reason: 'cancel' }])
  assert.equal(completions, 0)
  context.stopAnimation()
  await Promise.resolve()
  assert.equal(events.length, 1, 'stopping an already idle carousel is silent')

  context.setPositionDrag(130)
  context.setPosition(100)
  await Promise.resolve()
  assert.deepEqual(events.at(-1), { index: 1, position: 100, reason: 'cancel' })
})

test('zero-duration decorative transitions publish one complete idle boundary', async t => {
  const { carousel } = mount(t)
  const events = []
  carousel.on('motion:idle', payload => events.push(payload))
  for (const transition of ['fade', { name: 'skipped-cover', create() { throw new Error('duration is zero') } }]) {
    carousel.update({ transition, transitionDuration: 0 })
    carousel.next()
    await Promise.resolve()
  }
  assert.deepEqual(events, [
    { index: 1, position: 100, reason: 'complete' },
    { index: 2, position: 200, reason: 'complete' },
  ])
})

test('a replacement motion suppresses an intermediate idle notification and owns completion', async t => {
  let context
  const { carousel } = mount(t, [{ name: 'motion-observer', install(ctx) { context = ctx } }])
  const events = []
  carousel.on('motion:idle', payload => events.push(payload))
  carousel.next()
  frame(50)
  context.stopAnimation()
  context.snapBack(2)
  await Promise.resolve()
  assert.equal(events.length, 0, 'a cancelled predecessor must not resume autoplay during replacement motion')
  frame(200)
  await Promise.resolve()
  assert.deepEqual(events, [{ index: 2, position: 200, reason: 'complete' }])

  carousel.prev()
  frame(50)
  context.stopAnimation()
  carousel.update({ transitionDuration: 0 })
  carousel.goTo(0)
  await Promise.resolve()
  assert.deepEqual(events.at(-1), { index: 0, position: 0, reason: 'complete' })
  assert.equal(events.length, 2, 'synchronous replacement completion supersedes cancellation')
})

test('motion idle waits for callback-queued navigation, including a queued no-op', async t => {
  let context
  const { carousel } = mount(t, [{ name: 'motion-observer', install(ctx) { context = ctx } }])
  const events = []
  carousel.on('motion:idle', payload => events.push(payload))
  carousel.once('transition:start', () => {
    context.stopAnimation()
    carousel.goTo(2)
  })
  carousel.next()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(events.length, 0, 'replacement navigation owns the same synchronous request chain')
  assert.equal(carousel.getRenderState().phase, 'animation')
  frame(200)
  await Promise.resolve()
  assert.deepEqual(events, [{ index: 2, position: 200, reason: 'complete' }])

  carousel.once('transition:start', () => {
    context.stopAnimation()
    carousel.goTo(2)
  })
  carousel.prev()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(events.at(-1), { index: 2, position: 200, reason: 'cancel' })
  assert.equal(events.length, 2, 'a queued no-op cannot swallow the final idle boundary')
})

test('motion idle notifications are retired on destroy and callback navigation is deferred', async t => {
  let context
  const first = mount(t, [{ name: 'motion-observer', install(ctx) { context = ctx } }]).carousel
  let retiredNotifications = 0
  first.on('motion:idle', () => { retiredNotifications++ })
  first.next()
  context.stopAnimation()
  first.destroy()
  await Promise.resolve()
  assert.equal(retiredNotifications, 0)

  const { carousel } = mount(t)
  let callbackPhase
  carousel.once('motion:idle', () => {
    carousel.next()
    callbackPhase = carousel.getRenderState().phase
  })
  carousel.next()
  frame(200)
  await Promise.resolve()
  assert.equal(callbackPhase, 'idle')
  await Promise.resolve()
  assert.equal(carousel.getRenderState().phase, 'animation')
  frame(200)
  assert.equal(carousel.getIndex(), 2)
})

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

for (const count of [0, 2]) {
  test(`snap-back from a collection reset waits for the rebuilt ${count}-slide loop`, async t => {
    let context
    const { carousel } = mount(t, [{ name: 'reset-snap-back', install(value) { context = value } }])
    carousel.update({ loop: true, transitionDuration: 0 })
    const changes = []
    carousel.on('slide:change', value => changes.push(value))
    const replacements = Array.from({ length: count }, (_, index) => ({
      id: `replacement-${index}`, content: `Replacement ${index}`,
    }))
    carousel.once('render:reset', () => context.snapBack(Math.max(0, count - 1)))

    carousel.setSlides(replacements)

    assert.equal(carousel.getSlideCount(), count)
    assert.equal(carousel.getSlideElements().length, count,
      'the pending snap-back must not cancel the collection rebuild')
    assert.deepEqual(carousel.getSlideElements().map(element => element.markup),
      replacements.map(slide => slide.content))
    await Promise.resolve()
    assert.equal(carousel.getIndex(), Math.max(0, count - 1))
    const state = carousel.getRenderState()
    assert.equal(state.phase, 'idle')
    assert.equal(state.slides.length, count)
    assert.equal(Number.isFinite(state.position), true)
    assert.deepEqual(changes, [], 'settling the reset must not emit a navigation change')
  })
}

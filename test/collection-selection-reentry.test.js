import test from 'node:test'
import assert from 'node:assert/strict'
import { Carousel } from '../src/Carousel.js'

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
    this.nodeType = 1
    this.localName = tag.toLowerCase()
    this.namespaceURI = 'http://www.w3.org/1999/xhtml'
    this.style = { touchAction: '', setProperty(name, value) { this[name] = value },
      getPropertyValue(name) { return this[name] ?? '' }, getPropertyPriority() { return '' },
      removeProperty(name) { const value = this[name] ?? ''; delete this[name]; return value },
    }
    this.dataset = {}
    this.attributeValues = new Map()
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
  get childNodes() { return this.nodes }
  get children() { return this.nodes }
  get firstChild() { return this.nodes[0] ?? null }
  get firstElementChild() { return this.nodes[0] ?? null }
  get nextElementSibling() {
    return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null
  }
  get offsetWidth() { return this.width ?? this.parentNode?.offsetWidth ?? 100 }
  get offsetHeight() { return 20 }
  get scrollHeight() { return 20 }
  setAttribute(name, value) {
    this.attributeValues.set(name, String(value))
    if (name === 'class') this.className = String(value)
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value)
  }
  getAttribute(name) { return this.attributeValues.get(name) ?? null }
  removeAttribute(name) { this.attributeValues.delete(name) }

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
    node.attributeValues = new Map(this.attributeValues)
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
globalThis.document = { createElement: tag => new Element(tag), getElementById: () => null, querySelector: () => null, body: new Element('body') }
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

function createCarousel(t, options = {}, data = ['a', 'b', 'c'].map(id => ({ id, content: id }))) {
  const host = new Element()
  host.width = 400
  const carousel = new Carousel(host, data, { startIndex: 1, transitionDuration: 0, ...options })
  t.after(() => carousel.destroy())
  return { carousel, data, host }
}

const nestedMutations = {
  metadata: carousel => carousel.updateSlide(0, { meta: { updated: true } }),
  refresh: carousel => carousel.refresh(0),
  options: carousel => carousel.update({ gap: 4 }),
  move: carousel => carousel.moveSlide(0, 1),
  remove: carousel => carousel.removeSlide(0),
  add: carousel => carousel.addSlide({ id: 'new', content: 'New' }, 0),
  set: carousel => carousel.setSlides(carousel.getSlides()),
}

for (const loop of [false, true]) {
  for (const [name, mutate] of Object.entries(nestedMutations)) {
    test(`${loop ? 'loop' : 'finite'} collection selection survives nested ${name} before DOM reconciliation`, t => {
      const { carousel, data } = createCarousel(t, { loop })
      const original = carousel.getSlideElement()
      let positionalIndex
      carousel.once('render:reset', () => { positionalIndex = carousel.getIndex(); mutate(carousel) })

      carousel.setSlides([data[2], data[0], data[1]])

      assert.equal(positionalIndex, 1, 'getIndex retains its public positional semantics during reset')
      assert.equal(carousel.getSlide().id, 'b')
      assert.equal(carousel.getSlideElement(), original)
      assert.equal(carousel.getIndex(), carousel.getSlides().findIndex(slide => slide.id === 'b'))
    })
  }
}

test('a pending selection distinguishes repeated slide occurrences without public ids', t => {
  const repeated = { content: () => new Element('input') }
  const other = { content: 'Other' }
  const { carousel } = createCarousel(t, {}, [repeated, repeated, other])
  const selected = carousel.getSlideElement()
  carousel.once('render:reset', () => carousel.updateSlide(0, { meta: { revised: true } }))

  carousel.setSlides([other, repeated, repeated])

  assert.equal(carousel.getIndex(), 2)
  assert.equal(carousel.getSlideElement(), selected)
})

test('removing the pending selected key uses its new collection index for fallback', t => {
  const data = ['a', 'b', 'c', 'd'].map(id => ({ id, content: id }))
  const { carousel } = createCarousel(t, {}, data)
  carousel.once('render:reset', () => carousel.removeSlide(3))

  carousel.setSlides([data[3], data[2], data[0], data[1]])

  assert.deepEqual(carousel.getSlides().map(slide => slide.id), ['d', 'c', 'a'])
  assert.equal(carousel.getSlide().id, 'a')
  assert.equal(carousel.getIndex(), 2)
})

test('a completed child reconciliation cannot restore its superseded parent selection', t => {
  const data = ['a', 'b', 'c', 'd'].map(id => ({ id, content: id }))
  const { carousel } = createCarousel(t, {}, data)
  carousel.once('render:reset', () => {
    carousel.update({ slidesPerView: 4 })
    assert.equal(carousel.getSlide().id, 'd', 'the child clamps selection to its first visible page')
    carousel.update({ slidesPerView: 1 })
  })

  carousel.setSlides([data[3], data[2], data[0], data[1]])

  assert.equal(carousel.getSlide().id, 'd')
  assert.equal(carousel.getIndex(), 0)
})

test('resource cleanup inherits the pending key when it mutates a reordered collection', t => {
  let carousel, armed = false, disposed = 0
  const data = [{ id: 'a', content: () => ({ element: new Element('input'), destroy() {
    disposed++
    if (armed) { armed = false; carousel.updateSlide(0, { meta: { revised: true } }) }
  } }) }, { id: 'b', content: 'B' }, { id: 'c', content: 'C' }]
  ;({ carousel } = createCarousel(t, {}, data))
  const selected = carousel.getSlideElement()
  armed = true

  carousel.setSlides([data[2], { ...data[0], content: 'Replacement A' }, data[1]])

  assert.equal(carousel.getSlide().id, 'b')
  assert.equal(carousel.getSlideElement(), selected)
  assert.equal(disposed, 1)
  assert.equal(carousel.getSlideElement(1).innerHTML, 'Replacement A')
})

test('transition teardown cannot address old wrappers after new collection data is published', t => {
  let carousel, armed = false
  const created = [0, 0, 0]
  const data = ['a', 'b', 'c'].map((id, index) => ({ id, content: () => {
    created[index]++
    return new Element('input')
  } }))
  const transition = { name: 'teardown-mutation', create() { return {
    render() {}, destroy() {
      if (armed) { armed = false; carousel.updateSlide(0, { meta: { revised: true } }) }
    },
  } } }
  ;({ carousel } = createCarousel(t, { transition, transitionDuration: 100 }, data))
  const originals = carousel.getSlideElements()
  const firstContent = originals[0].firstChild
  firstContent.value = 'Keep user edit'
  carousel.goTo(2)
  armed = true

  carousel.setSlides([data[2], data[0], data[1]])

  assert.equal(carousel.getSlide().id, 'b')
  assert.deepEqual(carousel.getSlideElements(), [originals[2], originals[0], originals[1]])
  assert.equal(carousel.getSlideElement(1).firstChild, firstContent)
  assert.equal(firstContent.value, 'Keep user edit')
  assert.deepEqual(created, [1, 1, 1])
})

test('relative navigation from teardown resolves after the selected key has moved', async t => {
  let carousel, armed = false
  const data = ['a', 'b', 'c', 'd'].map(id => ({ id, content: id }))
  const transition = { name: 'teardown-next', create() { return {
    render() {}, destroy() { if (armed) { armed = false; carousel.next() } },
  } } }
  ;({ carousel } = createCarousel(t, { transition, transitionDuration: 100 }, data))
  carousel.goTo(2)
  armed = true

  carousel.setSlides([data[3], data[0], data[1], data[2]])
  assert.equal(carousel.getSlide().id, 'b')
  await Promise.resolve()
  frame(200)

  assert.equal(carousel.getSlide().id, 'c')
  assert.equal(carousel.getIndex(), 3)
})

test('a nested breakpoint change preserves the pending collection selection', t => {
  const originalMatchMedia = window.matchMedia
  const queries = []
  window.matchMedia = query => {
    const value = { media: query, matches: false, addEventListener(event, handler) { this.handler = handler },
      removeEventListener() {} }
    queries.push(value)
    return value
  }
  t.after(() => { window.matchMedia = originalMatchMedia })
  const { carousel, data } = createCarousel(t, { breakpoints: { 300: { gap: 10 } } })
  carousel.once('render:reset', () => {
    const query = queries.find(query => query.media === '(min-width: 300px)')
    query.matches = true
    query.handler()
  })

  carousel.setSlides([data[2], data[0], data[1]])

  assert.equal(carousel.getSlide().id, 'b')
  assert.equal(carousel.getIndex(), 2)
  assert.equal(carousel.getNavigationGeometry().step, 410)
})

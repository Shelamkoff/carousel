import test from 'node:test'
import assert from 'node:assert/strict'
import { createLazyLoad } from '../src/plugins/lazyload.js'

test('cancelled lazy rendering keeps a newer observation of the same retained slide', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  let observer
  globalThis.IntersectionObserver = class {
    observed = new Set()
    constructor(callback) { this.callback = callback; observer = this }
    observe(element) { this.observed.add(element) }
    unobserve(element) { this.observed.delete(element) }
    disconnect() { this.observed.clear() }
  }
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'IntersectionObserver', original)
    else delete globalThis.IntersectionObserver
  })
  const elements = Array.from({ length: 2 }, (_, index) => ({
    dataset: { index: String(index) }, classList: { add() {} },
  }))
  const slides = [{ content: 'First' }, { content: 'Second', lazy: true }]
  const handlers = new Map()
  let renderAttempts = 0
  const context = {
    getViewport: () => ({}), getIndex: () => 0,
    getSlideCount: () => 2, getSlidesPerView: () => 1.5, isLoop: () => false,
    getSlides: () => slides, getSlide: index => slides[index],
    getSlideElements: () => elements, getSlideElement: index => elements[index],
    on(event, handler) {
      handlers.set(event, handler)
      return () => handlers.delete(event)
    },
    emit(event, payload) { handlers.get(event)?.(payload) },
    renderSlide() {
      if (++renderAttempts === 1) {
        // A nested content replacement retains its wrapper, retires this
        // attempt and observes the new pending content during resize.
        context.emit('resize')
        return false
      }
      elements[1].dataset.rendered = 'true'
      return true
    },
  }
  const plugin = createLazyLoad({ preload: 0 })
  t.after(() => plugin.destroy())
  plugin.install(context)

  observer.callback([{ target: elements[1], isIntersecting: true }])

  assert.equal(observer.observed.has(elements[1]), true)
  assert.equal(elements[1].dataset.loaded, undefined)
  observer.callback([{ target: elements[1], isIntersecting: true }])
  assert.equal(renderAttempts, 2)
  assert.equal(elements[1].dataset.loaded, 'true')
  assert.equal(observer.observed.has(elements[1]), false)
})

test('a retired lazy observer cannot load or unobserve a later installation', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  const observers = []
  globalThis.IntersectionObserver = class {
    observed = new Set()
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe(element) { this.observed.add(element) }
    unobserve(element) { this.observed.delete(element) }
    disconnect() { this.observed.clear() }
  }
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'IntersectionObserver', original)
    else delete globalThis.IntersectionObserver
  })
  const elements = Array.from({ length: 2 }, (_, index) => ({
    dataset: { index: String(index) }, classList: { add() {} },
  }))
  const slides = [{ content: 'First' }, { content: 'Second', lazy: true }]
  let renders = 0
  const context = () => ({
    getViewport: () => ({}), getIndex: () => 0,
    getSlideCount: () => 2, getSlidesPerView: () => 1, isLoop: () => false,
    getSlides: () => slides, getSlide: index => slides[index],
    getSlideElements: () => elements, getSlideElement: index => elements[index],
    on() { return () => {} }, emit() {},
    renderSlide() { renders++; return true },
  })
  const plugin = createLazyLoad({ preload: 0 })
  t.after(() => plugin.destroy())
  plugin.install(context())
  plugin.destroy()
  plugin.install(context())

  observers[0].callback([{ target: elements[1], isIntersecting: true }])

  assert.equal(renders, 0)
  assert.equal(observers[1].observed.has(elements[1]), true)
})

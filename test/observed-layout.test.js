import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { TrackRenderer } from '../src/TrackRenderer.js'

const originals = new Map(['document', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame']
  .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
after(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

class Element {
  style = {}
  dataset = {}
  children = []
  parentNode = null
  width = null
  classList = { add() {}, remove() {}, toggle() {} }
  setAttribute() {}
  appendChild(child) { this.children.push(child); child.parentNode = this; return child }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1)
    this.parentNode = null
  }
  set innerHTML(value) { this.children.forEach(child => { child.parentNode = null }); this.children = []; this.markup = value }
  get offsetWidth() { return this.width ?? this.parentNode?.offsetWidth ?? 0 }
  get offsetHeight() { return 20 }
  get scrollHeight() { return 20 }
}
const observers = new Set(), frames = new Map()
let sequence = 0
globalThis.HTMLElement = Element
globalThis.document = { createElement: () => new Element() }
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; observers.add(this) }
  observe() {}
  disconnect() { observers.delete(this) }
}
globalThis.requestAnimationFrame = callback => { const id = ++sequence; frames.set(id, callback); return id }
globalThis.cancelAnimationFrame = id => frames.delete(id)
const observe = () => { for (const observer of observers) observer.callback([]) }
const frame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()) }
const slides = [{ content: 'Alpha' }, { content: 'Bravo' }]
function mount() {
  const host = new Element(); host.width = 640
  const renderer = new TrackRenderer()
  renderer.build(host, slides, { slidesPerView: 1, gap: 0 })
  return { host, renderer }
}

test('observed width changes retain the previous width and settle to the latest size', t => {
  const { host, renderer } = mount(), previous = []
  t.after(() => renderer.destroy())
  renderer.onResize(width => previous.push(width))
  host.width = 480; observe()
  host.width = 320; observe()
  frame()
  assert.equal(renderer.slideWidth, 320)
  assert.deepEqual(renderer.getSlideElements().map(slide => slide.style.width), ['320px', '320px'])
  assert.deepEqual(previous, [640])
  renderer.destroy()
})

test('destroy cancels pending observed work and leaves retired slide styles unchanged', t => {
  const { host, renderer } = mount(), retired = renderer.getSlideElements()
  t.after(() => renderer.destroy())
  host.width = 320; observe()
  renderer.destroy()
  const styles = retired.map(slide => ({ ...slide.style }))
  assert.equal(frames.size, 0)
  assert.equal(observers.size, 0)
  frame()
  assert.deepEqual(retired.map(slide => ({ ...slide.style })), styles)
  assert.equal(host.children.length, 0)
})

test('rebuild supersedes pending resize and records its synchronously measured width', t => {
  const { host, renderer } = mount(), previous = []
  t.after(() => renderer.destroy())
  renderer.onResize(width => previous.push(width))
  host.width = 320; observe()
  renderer.rebuild(slides, { slidesPerView: 2, gap: 0 })
  assert.equal(frames.size, 0)
  assert.equal(renderer.slideWidth, 160)
  observe(); frame()
  assert.deepEqual(previous, [])
  assert.deepEqual(renderer.getSlideElements().map(slide => slide.style.width), ['160px', '160px'])
  renderer.destroy()
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { TrackRenderer } from '../src/TrackRenderer.js'

class Element {
  style = { setProperty(name, value) { this[name] = value } }
  dataset = {}
  children = []
  parentNode = null
  get firstElementChild() { return this.children[0] ?? null }
  get nextElementSibling() {
    return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null
  }
  classList = { add() {}, remove() {}, toggle() {} }
  setAttribute() {}
  get offsetWidth() { return 400 }
  get offsetHeight() { return 20 }
  get scrollHeight() { return 20 }
  get textContent() { return this.children.map(child => child.textContent).join('') || this.markup || '' }
  set innerHTML(value) { this.replaceChildren(); this.markup = value }
  insertBefore(child, before) {
    child.remove()
    const index = before ? this.children.indexOf(before) : this.children.length
    this.children.splice(index, 0, child)
    child.parentNode = this
    return child
  }
  appendChild(child) { return this.insertBefore(child, null) }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1)
    this.parentNode = null
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) child.remove()
    for (const child of nodes) this.appendChild(child)
  }
}

test('nested reconciliation removes wrappers attached by an interrupted insertion', t => {
  const original = new Map(['document', 'ResizeObserver'].map(key => [key,
    Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.document = { createElement: () => new Element() }
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  const renderer = new TrackRenderer()
  t.after(() => renderer.destroy())
  const host = new Element()
  const slides = [{ content: 'First' }, { content: 'Second' }]
  const layout = { slidesPerView: 1, gap: 0 }
  const { track } = renderer.build(host, slides, layout)
  const insert = track.insertBefore.bind(track)
  let armed = true
  track.insertBefore = (node, before) => {
    const result = insert(node, before)
    if (armed) {
      armed = false
      renderer.rebuild([{ content: 'Latest' }], layout)
    }
    return result
  }

  renderer.rebuild([{ content: 'Interrupted' }, ...slides], layout)

  assert.deepEqual(track.children.map(slide => slide.textContent), ['Latest'])
  assert.deepEqual(renderer.getSlideElements(), track.children)
})

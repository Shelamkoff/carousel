import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { SlideContent } from '../src/SlideContent.js'

class Element {
  dataset = {}
  children = []
  parentNode = null
  classes = new Set()
  classList = { add: name => this.classes.add(name), remove: (...names) => names.forEach(name => this.classes.delete(name)) }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this }
  replaceChildren(...nodes) { for (const node of [...this.children]) node.remove(); nodes.forEach(node => this.appendChild(node)) }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null }
  cloneNode() { return new Element() }
  set innerHTML(value) { this.replaceChildren(); this.markup = value }
}
const original = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
globalThis.HTMLElement = Element
after(() => {
  if (original) Object.defineProperty(globalThis, 'HTMLElement', original)
  else delete globalThis.HTMLElement
})

test('owned content cleans up once while its DOM is still available', () => {
  const errors = [], wrapper = new Element(), element = new Element()
  const content = new SlideContent((index, error) => errors.push(error))
  const observed = []
  const resource = { element, destroy() { observed.push({ attached: element.parentNode === wrapper, receiver: this === resource }) } }
  assert.equal(content.render(wrapper, () => resource, 0), true)
  assert.equal(content.clear(wrapper, 0), true)
  content.clear(wrapper, 0)
  content.destroy()
  assert.deepEqual(observed, [{ attached: true, receiver: true }])
  assert.equal(wrapper.children.length, 0)
  assert.deepEqual(errors, [])
})

test('late factory results are disposed after synchronous reentry cancels their render', () => {
  const wrapper = new Element(), content = new SlideContent(() => {})
  let destroyed = 0
  const result = content.render(wrapper, () => {
    content.clear(wrapper, 0)
    return { element: new Element(), destroy() { destroyed++ } }
  }, 0)
  assert.equal(result, false)
  assert.equal(destroyed, 1)
  content.destroy()
  assert.equal(destroyed, 1)
  assert.equal(wrapper.children.length, 0)
})

test('cleanup reentry retains the newest content and never starts the retired factory', () => {
  const wrapper = new Element(), content = new SlideContent(() => {})
  const newest = new Element(), calls = []
  content.render(wrapper, () => ({ element: new Element(), destroy() {
    calls.push('old destroy')
    content.render(wrapper, () => ({ element: newest, destroy() { calls.push('new destroy') } }), 0)
  } }), 0)
  assert.equal(content.render(wrapper, () => { calls.push('retired factory'); return new Element() }, 0), false)
  assert.deepEqual(wrapper.children, [newest])
  assert.equal(wrapper.dataset.rendered, 'true')
  content.destroy()
  assert.deepEqual(calls, ['old destroy', 'new destroy'])
})

test('a factory element cannot be acquired by a second slide or content owner', () => {
  const errors = [], first = new SlideContent((index, error) => errors.push(error)), second = new SlideContent((index, error) => errors.push(error))
  const wrapper = new Element(), duplicate = new Element(), element = new Element()
  let destroyed = 0
  const resource = { element, destroy() { destroyed++ } }
  assert.equal(first.render(wrapper, () => resource, 0), true)
  assert.equal(second.render(duplicate, () => resource, 1), false)
  assert.equal(element.parentNode, wrapper)
  assert.equal(destroyed, 0)
  second.destroy()
  first.destroy()
  assert.equal(destroyed, 1)
  assert.match(errors[0].message, /already has an owner/)
})

test('cleanup failures remain isolated during replacement and bulk disposal', () => {
  const errors = [], content = new SlideContent((index, error) => errors.push({ index, message: error.message }))
  const first = new Element(), second = new Element()
  first.dataset.index = '3'
  let clean = 0
  content.render(first, () => ({ element: new Element(), destroy() { throw new Error('cleanup failed') } }), 0)
  content.render(second, () => ({ element: new Element(), destroy() { clean++ } }), 1)
  assert.equal(content.render(first, 'Replacement', 3), true)
  content.destroy()
  assert.deepEqual(errors, [{ index: 3, message: 'cleanup failed' }])
  assert.equal(clean, 1)
})

test('invalid resources still dispose their acquired external work', () => {
  const errors = [], content = new SlideContent((index, error) => errors.push(error))
  let destroyed = 0
  assert.equal(content.render(new Element(), () => ({ element: null, destroy() { destroyed++ } }), 0), false)
  assert.equal(destroyed, 1)
  assert.equal(errors.length, 1)
  content.destroy()
})

test('async factories and destructors are rejected without unhandled rejections', async () => {
  const errors = [], content = new SlideContent((index, error) => errors.push(error.message)), wrapper = new Element()
  assert.equal(content.render(wrapper, async () => { throw new Error('factory rejection') }, 0), false)
  content.render(wrapper, () => ({ element: new Element(), async destroy() { throw new Error('cleanup rejection') } }), 0)
  content.destroy()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(errors.length, 2)
  assert.ok(errors.every(message => /must be synchronous/.test(message)))
})

test('unused detached staging resources are released without touching retained content', () => {
  const content = new SlideContent(() => {}), kept = new Element(), staged = new Element(), calls = []
  content.render(kept, () => ({ element: new Element(), destroy() { calls.push('kept') } }), 0)
  content.render(staged, () => ({ element: new Element(), destroy() { calls.push('staged') } }), 1)
  assert.equal(content.releaseUnused(new Set([kept])), true)
  assert.deepEqual(calls, ['staged'])
  content.destroy()
  assert.deepEqual(calls, ['staged', 'kept'])
})

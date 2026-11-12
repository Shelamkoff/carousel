import test from 'node:test'
import assert from 'node:assert/strict'
import { StyleLedger } from '../src/effects/StyleLedger.js'

function element() {
  const values = new Map()
  return { style: {
    getPropertyValue: name => values.get(name)?.value ?? '',
    getPropertyPriority: name => values.get(name)?.priority ?? '',
    setProperty(name, value, priority = '') { values.set(name, { value, priority }) },
    removeProperty(name) { values.delete(name) },
  } }
}

test('composed effects keep insertion priority across frames and release in either order', () => {
  const node = element()
  node.style.setProperty('opacity', '.1', 'important')
  const first = new StyleLedger()
  const second = new StyleLedger()
  const third = new StyleLedger()
  first.set(node, 'opacity', '.2')
  second.set(node, 'opacity', '.4')
  third.set(node, 'opacity', '.6')
  first.set(node, 'opacity', '.3')
  second.set(node, 'opacity', '.5')
  assert.equal(node.style.getPropertyValue('opacity'), '.6', 'new frames do not raise older owners')
  second.clear()
  assert.equal(node.style.getPropertyValue('opacity'), '.6', 'removing a covered owner leaves the top intact')
  third.clear()
  assert.equal(node.style.getPropertyValue('opacity'), '.3', 'the latest value of the surviving owner reappears')
  first.clear()
  assert.equal(node.style.getPropertyValue('opacity'), '.1')
  assert.equal(node.style.getPropertyPriority('opacity'), 'important')
})

test('application writes remain the baseline across owner updates, removal and reuse', () => {
  const node = element()
  const first = new StyleLedger()
  const second = new StyleLedger()
  first.set(node, 'transform', 'scale(.9)')
  second.set(node, 'transform', 'scale(.8)')
  node.style.setProperty('transform', 'rotate(10deg)', 'important')
  first.set(node, 'transform', 'scale(.7)')
  assert.equal(node.style.getPropertyValue('transform'), 'scale(.8)')
  second.clear()
  assert.equal(node.style.getPropertyValue('transform'), 'scale(.7)')
  first.clear()
  assert.equal(node.style.getPropertyValue('transform'), 'rotate(10deg)')
  assert.equal(node.style.getPropertyPriority('transform'), 'important')

  second.set(node, 'transform', 'scale(.6)')
  first.set(node, 'transform', 'scale(.5)')
  assert.equal(node.style.getPropertyValue('transform'), 'scale(.5)', 'reacquisition gets a new insertion priority')
  node.style.setProperty('transform', 'rotate(20deg)', 'important')
  second.clear()
  first.clear()
  assert.equal(node.style.getPropertyValue('transform'), 'rotate(20deg)', 'teardown preserves later application writes')
  assert.equal(node.style.getPropertyPriority('transform'), 'important')
})

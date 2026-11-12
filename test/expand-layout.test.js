import test from 'node:test'
import assert from 'node:assert/strict'
import { getExpandGeometry, getExpandSlot, getExpandVirtualIndex } from '../src/expand.js'

const slot = (position, index, count = 6, loop = true) => getExpandSlot(
  getExpandGeometry(position, 900, 2.5, 2.5, 32, 18, count, loop), index,
)

test('expand cards distribute space with continuous widths and offsets', () => {
  const start = slot(0, 0)
  assert.ok(start.size > slot(0, 1).size * 2)
  assert.equal(start.offset, 32)
  assert.equal(slot(.5, 0).size, slot(.5, 1).size)
  assert.ok(slot(.5, 0).size < start.size)
  assert.equal(slot(1, 1).size, start.size)
  assert.equal(slot(1, 1).offset, 32)
  for (let position = -1; position <= 7; position += .01) {
    const index = Math.floor(position)
    const before = slot(position, index)
    const after = slot(position, index + 1)
    assert.ok(Math.abs(after.offset - before.offset - before.size - 18) < 1e-5)
    assert.ok(before.size >= 0 && after.size >= 0)
  }
})

test('expand geometry remains continuous at integer boundaries', () => {
  for (let index = 1; index < 6; index++) {
    for (const slide of [index - 1, index, index + 1, index + 2]) {
      const before = slot(index - 1e-6, slide)
      const after = slot(index + 1e-6, slide)
      assert.ok(Math.abs(before.size - after.size) < .01)
      assert.ok(Math.abs(before.offset - after.offset) < .01)
    }
  }
})

test('expand finite last slide aligns toward trailing edge', () => {
  const first = slot(0, 0, 3, false)
  const last = slot(2, 2, 3, false)
  assert.equal(first.offset, 32)
  assert.ok(last.offset > first.offset)
  assert.ok(last.offset + last.size <= 900)
})

test('expand loop copies fill the preceding and following slots', () => {
  assert.deepEqual([getExpandVirtualIndex(0, 0, 2), getExpandVirtualIndex(0, 0, 2, 1),
    getExpandVirtualIndex(1, 0, 2), getExpandVirtualIndex(1, 0, 2, 1)], [0, 2, 1, -1])
  assert.deepEqual([getExpandVirtualIndex(0, 1, 2), getExpandVirtualIndex(0, 1, 2, 1),
    getExpandVirtualIndex(1, 1, 2), getExpandVirtualIndex(1, 1, 2, 1)], [2, 0, 1, 3])
})

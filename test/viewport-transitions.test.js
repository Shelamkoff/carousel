import test from 'node:test'
import assert from 'node:assert/strict'
import { getPanelState, getPanelCount } from '../src/transitions/ViewportTransition.js'

for (const [variant, count] of [['stairs', 8], ['pixel', 64], ['curtain', 2]]) {
  test(`${variant} covers the whole viewport at the commit boundary and reveals it at the end`, () => {
    assert.equal(getPanelCount(variant), count)
    for (let index = 0; index < count; index++) {
      const initial = getPanelState(variant, index, 0)
      const covered = getPanelState(variant, index, 0.5)
      const final = getPanelState(variant, index, 1)
      assert.equal(covered.opacity, 1)
      assert.equal(covered.x, 0)
      assert.equal(covered.y, 0)
      if (variant === 'pixel') {
        assert.equal(initial.opacity, 0)
        assert.equal(final.opacity, 0)
      } else {
        assert.equal(Math.abs(initial.x) + Math.abs(initial.y), 100)
        assert.equal(Math.abs(final.x) + Math.abs(final.y), 100)
      }
    }
  })
}

test('pixel fade order is deterministic and progresses beyond the first tile', () => {
  const first = Array.from({ length: 64 }, (_, index) => getPanelState('pixel', index, 0.1).opacity)
  const again = Array.from({ length: 64 }, (_, index) => getPanelState('pixel', index, 0.1).opacity)
  const later = Array.from({ length: 64 }, (_, index) => getPanelState('pixel', index, 0.3).opacity)
  assert.deepEqual(first, again)
  assert.ok(first.some(value => value === 0))
  assert.ok(first.some(value => value > 0))
  assert.ok(later.every((value, index) => value >= first[index]))
  assert.ok(later.some(value => value > 0.9))
})

test('backward stairs reverse the column stagger without changing the commit boundary', () => {
  for (let index = 0; index < 8; index++) {
    assert.deepEqual(getPanelState('stairs', index, 0.17, true), getPanelState('stairs', 7 - index, 0.17))
    assert.deepEqual(getPanelState('stairs', index, 0.5, true), { x: 0, y: 0, opacity: 1 })
  }
})

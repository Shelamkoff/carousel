import test from 'node:test'
import assert from 'node:assert/strict'
import { getPanelState, getPanelCount } from '../src/transitions/ViewportTransition.js'

for (const [variant, count] of [['stairs', 8], ['stairs-horizontal', 8], ['pixel', 64], ['curtain', 2]]) {
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

test('horizontal stairs sweep alternating rows across the viewport instead of returning to their entry edge', () => {
  for (let index = 0; index < 8; index++) {
    const entry = index % 2 === 0 ? -100 : 100
    for (const backwards of [false, true]) {
      assert.deepEqual(getPanelState('stairs-horizontal', index, 0, backwards), { x: entry, y: 0, opacity: 1 })
      assert.deepEqual(getPanelState('stairs-horizontal', index, 0.5, backwards), { x: 0, y: 0, opacity: 1 })
      assert.deepEqual(getPanelState('stairs-horizontal', index, 1, backwards), { x: -entry, y: 0, opacity: 1 })
      for (const progress of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
        const state = getPanelState('stairs-horizontal', index, progress, backwards)
        assert.equal(state.y, 0)
        assert.equal(state.opacity, 1)
        assert.ok(Math.abs(state.x) <= 100)
        assert.ok(progress < 0.5 ? state.x * entry >= 0 : state.x * entry <= 0)
      }
    }
  }
})

test('backward horizontal stairs reverse only the row stagger and preserve alternating directions', () => {
  for (const progress of [0.17, 0.67]) {
    for (let index = 0; index < 8; index++) {
      const reverse = getPanelState('stairs-horizontal', index, progress, true)
      const mirroredRank = getPanelState('stairs-horizontal', 7 - index, progress)
      assert.equal(Math.abs(reverse.x), Math.abs(mirroredRank.x))
      assert.equal(reverse.y, 0)
      const entry = index % 2 === 0 ? -1 : 1
      assert.ok(progress < 0.5 ? reverse.x * entry >= 0 : reverse.x * entry <= 0)
    }
  }
  assert.ok(Math.abs(getPanelState('stairs-horizontal', 0, 0.17).x) < Math.abs(getPanelState('stairs-horizontal', 7, 0.17).x))
  assert.ok(Math.abs(getPanelState('stairs-horizontal', 0, 0.17, true).x) > Math.abs(getPanelState('stairs-horizontal', 7, 0.17, true).x))
})

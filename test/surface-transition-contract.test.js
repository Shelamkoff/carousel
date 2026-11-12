import test from 'node:test'
import assert from 'node:assert/strict'
import { isSurfaceTransition } from '../src/transitions/SurfaceTransition.js'
import { isViewportTransition } from '../src/transitions/ViewportTransition.js'
import { createSurfaceCrossfade, createSurfacePageTurn } from '../src/transitions/surfaces.js'

test('surface definitions have their own discriminant and a finite commit boundary', () => {
  const definition = { kind: 'surfaces', name: 'custom', createSurfaces: () => ({ render() {} }) }
  for (const commitAt of [undefined, 0, .25, 1]) {
    const candidate = { ...definition, commitAt }
    assert.equal(isSurfaceTransition(candidate), true)
    assert.equal(isViewportTransition(candidate), false)
  }
  for (const commitAt of [-.1, 1.01, NaN, Infinity, '0.5', null]) {
    const candidate = { ...definition, commitAt }
    assert.equal(isSurfaceTransition(candidate), false)
    assert.equal(isViewportTransition(candidate), false)
  }
  for (const candidate of [null, [], {}, { ...definition, kind: 'unknown' },
    { ...definition, name: ' ' }, { ...definition, createSurfaces: null }]) {
    assert.equal(isSurfaceTransition(candidate), false)
  }
  assert.equal(isViewportTransition({ name: 'legacy-cover', create() {} }), true)
  assert.equal(isViewportTransition({ kind: 'cover', name: 'explicit-cover', create() {} }), true)
})

test('surface example factories are fresh reusable definitions with explicit options', () => {
  for (const create of [createSurfaceCrossfade, createSurfacePageTurn]) {
    const first = create()
    const second = create({ name: 'custom-name', commitAt: .75 })
    assert.equal(isSurfaceTransition(first), true)
    assert.equal(first.commitAt, 1)
    assert.equal(second.name, 'custom-name')
    assert.equal(second.commitAt, .75)
    assert.notEqual(first, second)
    assert.throws(() => create({ commitAt: 2 }), RangeError)
    assert.throws(() => create({ commitAt: null }), RangeError)
    assert.throws(() => create({ name: '' }), TypeError)
    assert.throws(() => create({ name: null }), TypeError)
  }
  assert.throws(() => createSurfacePageTurn({ perspective: 0 }), RangeError)
  assert.throws(() => createSurfacePageTurn({ perspective: null }), RangeError)
})

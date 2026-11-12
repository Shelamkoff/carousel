import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutoScroll } from '../src/plugins/autoScroll.js'

test('continuous playback rejects invalid speeds and directions before installation', () => {
  for (const speed of [0, -1, NaN, Infinity, '40']) {
    assert.throws(() => createAutoScroll({ speed }), RangeError)
  }
  for (const direction of ['left', 'up', 1, '']) {
    assert.throws(() => createAutoScroll({ direction }), TypeError)
  }
  for (const options of [null, [], '40']) assert.throws(() => createAutoScroll(options), TypeError)
})

test('continuous playback validates each suspension policy', () => {
  for (const key of ['autoStart', 'pauseOnHover', 'pauseOnFocus', 'pauseOnInteraction', 'respectReducedMotion']) {
    assert.throws(() => createAutoScroll({ [key]: 'true' }), TypeError)
    assert.doesNotThrow(() => createAutoScroll({ [key]: false }))
  }
})

test('invalid velocity updates leave the previous configuration intact', () => {
  const scroll = createAutoScroll({ speed: 42, direction: 'backward' })
  const initial = scroll.getState()
  for (const patch of [{ speed: -1 }, { speed: 80, direction: 'right' }, { speed: null }, null, []]) {
    assert.throws(() => scroll.update(patch))
    assert.deepEqual(scroll.getState(), initial)
  }
  scroll.update({ speed: 80 })
  assert.equal(scroll.getState().direction, 'backward')
  assert.equal(scroll.getState().speed, 80)
  assert.equal(initial.speed, 42, 'state snapshots do not mutate')
  assert.ok(Object.isFrozen(initial))
})

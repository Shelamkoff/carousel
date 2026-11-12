import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLayoutSlots } from '../src/layouts.js'

const context = {
  position: 0, step: 100, viewportSize: 100, gap: 0, count: 2,
  loop: false, orientation: 'horizontal',
  slides: [{ index: 0, copy: 0, isCopy: false, offset: 0, size: 100, progress: 0 },
    { index: 1, copy: 0, isCopy: false, offset: 100, size: 100, progress: 1 }],
}

test('layout inputs are detached and readonly while output controls only numeric geometry', () => {
  const definition = { name: 'isolated-layout', render(frame) {
    assert.notEqual(frame, context)
    assert.notEqual(frame.slides, context.slides)
    assert.throws(() => { frame.slides[0].offset = 90 }, TypeError)
    return frame.slides.map(slot => ({ offset: slot.offset / 2, size: 75 }))
  } }
  assert.deepEqual(resolveLayoutSlots(definition, context, {}), [
    { offset: 0, size: 75, progress: 0 }, { offset: 50, size: 75, progress: 1 },
  ])
  assert.equal(context.slides[0].offset, 0)
})

test('invalid geometry is rejected before an output frame is returned', () => {
  for (const result of [[], [{ offset: 0, size: 100 }],
    [{ offset: 0, size: 100 }, { offset: NaN, size: 10 }],
    [{ offset: 0, size: 100 }, { offset: 100, size: -1 }]]) {
    assert.throws(() => resolveLayoutSlots({ name: 'invalid', render: () => result }, context, {}), TypeError)
  }
})

test('asynchronous layouts fail synchronously without an unhandled rejection', async () => {
  assert.throws(() => resolveLayoutSlots({ name: 'async', render: async () => {
    throw new Error('asynchronous failure')
  } }, context, {}), TypeError)
  await new Promise(resolve => setTimeout(resolve, 0))
})

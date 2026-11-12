import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLayoutSlots } from '../src/layouts.js'

test('a custom layout cannot silently omit a visual slot with a sparse output array', () => {
  const context = {
    position: 0, step: 100, viewportSize: 200, gap: 0, count: 2,
    loop: false, orientation: 'horizontal',
    slides: [0, 1].map(index => ({ index, copy: 0, isCopy: false,
      offset: index * 100, size: 100, progress: index })),
  }
  const output = [{ offset: 0, size: 100 }]
  output.length = 2
  assert.throws(() => resolveLayoutSlots({ name: 'missing-slot', render: () => output }, context, {}),
    /geometry must contain finite/)
})

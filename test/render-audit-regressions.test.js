import test from 'node:test'
import assert from 'node:assert/strict'
import { LoopEngine } from '../src/LoopEngine.js'

test('explicit loop navigation chooses the forward route for equal distances', () => {
  const loop = new LoopEngine(4, 100)
  assert.equal(loop.shortestDelta(0, 2), 200)
  assert.equal(loop.shortestDelta(200, 0), 200)
  assert.equal(loop.shortestDelta(-200, 0), 200)
  assert.equal(loop.shortestDelta(1000, 0), 200)
  assert.equal(loop.shortestDelta(201, 0), 199)
  assert.equal(loop.shortestDelta(199, 0), -199)
})

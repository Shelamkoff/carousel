import test from 'node:test'
import assert from 'node:assert/strict'
import { BreakpointManager } from '../src/BreakpointManager.js'

function installMatchMedia(width) {
  const records = []
  globalThis.window = {
    matchMedia(query) {
      const minWidth = Number(query.match(/(\d+)/)?.[1] ?? 0)
      const listeners = new Set()
      const mql = {
        matches: width >= minWidth,
        addEventListener(_name, listener) { listeners.add(listener) },
        removeEventListener(_name, listener) { listeners.delete(listener) },
      }
      records.push({ query, listeners })
      return mql
    },
  }
  return records
}

test('runtime breakpoint updates replace media queries and resolve new overrides', () => {
  const records = installMatchMedia(900)
  const manager = new BreakpointManager(
    { slidesPerView: 1, breakpoints: { 600: { slidesPerView: 2 } } },
    { 600: { slidesPerView: 2 } },
  )
  assert.equal(manager.resolve().slidesPerView, 2)
  assert.equal(records[0].listeners.size, 1)

  manager.updateBase({ slidesPerView: 1, breakpoints: { 800: { slidesPerView: 4 } } })
  assert.equal(records[0].listeners.size, 0)
  assert.equal(records[1].listeners.size, 1)
  assert.equal(manager.resolve().slidesPerView, 4)

  manager.destroy()
  assert.equal(records[1].listeners.size, 0)
  delete globalThis.window
})

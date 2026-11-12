import test from 'node:test'
import assert from 'node:assert/strict'
import { EventBus } from '@shelamkoff/event-bus'
import { createSlideEffect } from '../src/effects/createSlideEffect.js'

function scope() {
  const events = new EventBus()
  const errors = []
  let state = { slides: [] }
  events.on('effect:error', error => errors.push(error))
  return {
    errors,
    getRoot: () => null,
    getViewport: () => null,
    getTrack: () => null,
    getRenderState: () => state,
    on: (name, callback) => events.on(name, callback),
    emit: (name, value) => events.emit(name, value),
    publish(next) {
      state = next
      events.emit('render', state)
    },
  }
}

test('a retired render failure does not destroy a replacement effect instance', async () => {
  const first = scope()
  const second = scope()
  let count = 0
  let replace = false
  const destroyed = []
  const rendered = []
  const effect = createSlideEffect({ name: 'reused', create() {
    const instance = ++count
    return {
      render() {
        rendered.push(instance)
        if (instance === 1 && replace) {
          effect.destroy()
          effect.install(second)
          throw new Error('retired render')
        }
      },
      destroy() { destroyed.push(instance) },
    }
  } })
  try {
    effect.install(first)
    replace = true
    first.emit('render', first.getRenderState())
    await Promise.resolve()
    second.emit('render', second.getRenderState())
    assert.equal(count, 2)
    assert.deepEqual(destroyed, [1])
    assert.equal(rendered.at(-1), 2)
    assert.deepEqual(second.errors, [])
  } finally { effect.destroy() }
  assert.deepEqual(destroyed, [1, 2])
})

test('an effect skips a retired frame after an earlier render listener rebuilds', () => {
  const context = scope()
  const outer = { slides: [], revision: 1 }
  const replacement = { slides: [], revision: 2 }
  const rendered = []
  context.on('render', state => {
    if (state !== outer) return
    context.emit('render:reset')
    context.publish(replacement)
  })
  const effect = createSlideEffect({ name: 'current-frame', create() {
    return { render(state) { rendered.push(state) } }
  } })
  try {
    effect.install(context)
    rendered.length = 0
    context.publish(outer)
    assert.deepEqual(rendered, [replacement])
    assert.deepEqual(context.errors, [])
  } finally { effect.destroy() }
})

test('a queued reentrant effect frame cannot run after a newer frame is already rendered', async () => {
  const context = scope()
  const outer = { slides: [], revision: 1 }
  const queued = { slides: [], revision: 2 }
  const latest = { slides: [], revision: 3 }
  const rendered = []
  const effect = createSlideEffect({ name: 'pending-frame', create() {
    return { render(state) {
      rendered.push(state)
      if (state === outer) context.publish(queued)
    } }
  } })
  try {
    effect.install(context)
    rendered.length = 0
    context.publish(outer)
    context.publish(latest)
    await Promise.resolve()
    assert.deepEqual(rendered, [outer, latest])
    assert.deepEqual(context.errors, [])
  } finally { effect.destroy() }
})

test('an invalid effect instance still releases the resources it returned', () => {
  const context = scope()
  let destroyed = 0
  const effect = createSlideEffect({ name: 'invalid-renderer', create() {
    return { destroy() { destroyed++ } }
  } })
  effect.install(context)
  assert.equal(context.errors.length, 1)
  assert.match(context.errors[0].error.message, /must return render/)
  assert.equal(destroyed, 1)
  effect.destroy()
  assert.equal(destroyed, 1)
})

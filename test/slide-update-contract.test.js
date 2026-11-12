import test from 'node:test'
import assert from 'node:assert/strict'
import { SlideManager } from '../src/SlideManager.js'

test('slide updates describe only the changed fields and retain the opaque identity', () => {
  const original = { id: 'card', content: 'Card', thumb: 'before.jpg', meta: { title: 'Before' } }
  const manager = new SlideManager([original])
  const key = manager.getKey(0)
  const meta = { title: 'After' }
  const change = manager.updateSlide(0, { meta, thumb: 'after.jpg' })

  assert.equal(change.previous, original)
  assert.equal(change.slide, manager.getSlide(0))
  assert.deepEqual(change, { previous: original, slide: { ...original, meta, thumb: 'after.jpg' },
    contentChanged: false, lazyChanged: false, metadataChanged: true, thumbChanged: true })
  assert.equal(manager.getKey(0), key)
})

test('explicit content replacement remains a refresh even when its reference is unchanged', () => {
  const content = () => null
  const manager = new SlideManager([{ content }])
  assert.equal(manager.updateSlide(0, { content }).contentChanged, true)
  assert.deepEqual(manager.updateSlide(0, { lazy: true }), {
    previous: { content }, slide: { content, lazy: true },
    contentChanged: false, lazyChanged: true, metadataChanged: false, thumbChanged: false,
  })
  assert.equal(manager.updateSlide(0, { lazy: true }).lazyChanged, false)
})

test('bulk reconciliation consumes repeated identities in their existing occurrence order', () => {
  const repeated = { content: 'Repeated' }
  const other = { id: 'other', content: 'Other' }
  const manager = new SlideManager([repeated, other, repeated, repeated])
  const keys = manager.getKeys()

  manager.setSlides([repeated, repeated, { ...other }, repeated, repeated])

  assert.deepEqual(manager.getKeys().slice(0, 4), [keys[0], keys[2], keys[1], keys[3]])
  assert.ok(!keys.includes(manager.getKey(4)))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { SlideManager } from '../src/SlideManager.js'

test('inserting a repeated data object gives only the new occurrence a new identity', () => {
  const repeated = { content: 'Repeated card' }
  const slides = new SlideManager([repeated, repeated])
  const original = slides.getKeys()

  slides.addSlide(repeated, 0)

  assert.equal(slides.getKey(1), original[0])
  assert.equal(slides.getKey(2), original[1])
  assert.ok(!original.includes(slides.getKey(0)))
})

test('rejected insertion leaves the collection and its identities intact', () => {
  const slides = new SlideManager([{ id: 'first', content: 'First card' }])
  const original = slides.getSlides()
  const keys = slides.getKeys()

  assert.throws(() => slides.addSlide({ id: 'first', content: 'Duplicate id' }), TypeError)
  assert.throws(() => slides.addSlide({ content: null }), TypeError)

  assert.deepEqual(slides.getSlides(), original)
  assert.deepEqual(slides.getKeys(), keys)
})

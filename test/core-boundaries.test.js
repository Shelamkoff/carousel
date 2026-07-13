import test from 'node:test'
import assert from 'node:assert/strict'
import { LoopEngine } from '../src/LoopEngine.js'
import { SlideManager } from '../src/SlideManager.js'
import { createAutoplay } from '../src/plugins/autoplay.js'
import { createArrows } from '../src/plugins/arrows.js'
import { createDots } from '../src/plugins/dots.js'
import { createLazyLoad } from '../src/plugins/lazyload.js'
import { createSwipe } from '../src/plugins/swipe.js'

test('loop engine validates construction and preserves wrap math', () => {
  assert.throws(() => new LoopEngine(-1, 100), RangeError)
  assert.throws(() => new LoopEngine(3, Number.NaN), RangeError)
  const loop = new LoopEngine(3, 100)
  assert.equal(loop.toIndex(299), 0)
  assert.equal(loop.shortestDelta(200, 0), 100)
})

test('slide manager rejects indexes that splice would otherwise coerce', () => {
  const slides = new SlideManager([{ content: 'one' }])
  assert.throws(() => slides.addSlide({ content: 'two' }, 0.5), RangeError)
  assert.throws(() => slides.removeSlide(-1), RangeError)
  slides.clear()
  assert.equal(slides.getSlideCount(), 0)
})

test('autoplay no-op does not mask the next user interaction', async () => {
  const handlers = new Map()
  const plugin = createAutoplay({ interval: 1, pauseOnHover: false, pauseOnInteraction: true })
  const context = {
    getRoot: () => null,
    getSlideCount: () => 2,
    getSlidesPerView: () => 1,
    getIndex: () => 0,
    isLoop: () => true,
    next() {}, // Simulate a navigation lock while another transition is active.
    emit() {},
    on(event, handler) {
      handlers.set(event, handler)
      return () => handlers.delete(event)
    },
  }

  plugin.install(context)
  await new Promise(resolve => setTimeout(resolve, 10))
  handlers.get('slide:beforeChange')?.()
  assert.equal(plugin.isActive(), false)
  plugin.destroy()
})

test('plugin factories reject coercive configuration', () => {
  assert.throws(() => createArrows({ hideOnEdge: 'yes' }), TypeError)
  assert.throws(() => createDots({ clickable: 1 }), TypeError)
  assert.throws(() => createSwipe({ mouse: 'yes' }), TypeError)
  assert.throws(() => createAutoplay({ pauseOnHover: 1 }), TypeError)
  assert.throws(() => createLazyLoad({ rootMargin: '' }), TypeError)
})

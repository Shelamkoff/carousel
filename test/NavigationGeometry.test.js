import test from 'node:test'
import assert from 'node:assert/strict'
import { createNavigationGeometry } from '../src/NavigationGeometry.js'
import { LoopEngine } from '../src/LoopEngine.js'

function context(count = 4, overrides = {}) {
  return {
    viewportSize: 100, count, slidesPerView: 1, gap: 0, orientation: 'horizontal',
    slides: Array.from({ length: count }, (_, index) => ({ index, id: `slide-${index}` })),
    ...overrides,
  }
}

function custom(measurement, options = {}) {
  return createNavigationGeometry(context(measurement.slides.length, options), {
    name: 'variable', measure: () => measurement,
  })
}

const variable = () => custom({
  slides: [{ offset: 0, size: 80 }, { offset: 100, size: 180 }, { offset: 300, size: 100 }],
})

test('uniform geometry preserves fractional finite destinations and raw snap rounding', () => {
  const model = createNavigationGeometry(context(6, { slidesPerView: 2.5, viewportSize: 250 }))
  assert.equal(model.step, 100)
  assert.equal(model.maxPosition, 350)
  assert.equal(model.lastIndex, 4)
  assert.equal(model.indexToPosition(4), 350)
  assert.equal(model.positionToIndex(326), 3)
  assert.equal(model.positionToIndex(350), 4)
  assert.equal(model.positionToIndex(349.99999), 4)
  assert.equal(model.indexToPosition(5, true), 500)
  assert.deepEqual(model.bounds, { min: 0, max: 350 })
})

test('uniform below-one views preserve the tail beyond the final raw snap', () => {
  const model = createNavigationGeometry(context(3, { slidesPerView: .5, viewportSize: 50 }))
  assert.equal(model.lastIndex, 2)
  assert.equal(model.maxPosition, 250)
  assert.equal(model.indexToPosition(2), 200)
  assert.equal(model.positionToIndex(250), 2)
})

test('uniform physical steps can differ from the logical per-view bounds for expand', () => {
  const model = createNavigationGeometry(context(5, { viewportSize: 500 }), undefined,
    { slideSize: 90, step: 100 })
  assert.equal(model.slideSize, 90)
  assert.equal(model.step, 100)
  assert.equal(model.lastIndex, 4)
  assert.equal(model.maxPosition, 400)
  assert.equal(model.loopLength, 500)
})

test('zero geometry remains finite and retains a logical last index', () => {
  const model = createNavigationGeometry(context(4, { viewportSize: 0 }))
  assert.equal(model.lastIndex, 3)
  assert.equal(model.loopLength, 0)
  assert.equal(model.positionToIndex(100), 0)
  assert.equal(model.logicalPosition(100, true), 0)
  assert.equal(model.progress(2, 100, true), 2)
  assert.equal(model.normalize(100), 0)
  const empty = createNavigationGeometry(context(0))
  assert.equal(empty.lastIndex, 0)
  assert.equal(empty.maxPosition, 0)
  assert.deepEqual(empty.getSlots([], 0, true), [])
})

test('custom geometry navigates physical offsets and interpolates logical progress', () => {
  const model = variable()
  assert.equal(model.uniform, false)
  assert.deepEqual(model.snapPoints, [0, 100, 300])
  assert.equal(model.loopLength, 400)
  assert.equal(model.maxPosition, 300)
  assert.equal(model.lastIndex, 2)
  assert.equal(model.indexToPosition(2), 300)
  assert.equal(model.positionToIndex(199), 1)
  assert.equal(model.positionToIndex(200), 2)
  assert.equal(model.logicalPosition(200), 1.5)
  assert.equal(model.logicalPosition(-50), -.5)
  assert.equal(model.logicalPosition(400), 2.5)
  assert.equal(model.progress(2, 200), .5)
  assert.equal(model.logicalPosition(350, true), 2.5)
  assert.equal(model.positionToIndex(350, true), 0)
  assert.equal(model.progress(0, 350, true), .5)
})

test('custom snaps, bounds and default maximum support a clipped final destination', () => {
  const model = custom({
    slides: [{ offset: 0, size: 100 }, { offset: 150, size: 150 }, { offset: 400, size: 100 }],
    snapPoints: [0, 120, 400],
  }, { viewportSize: 250 })
  assert.equal(model.maxPosition, 250)
  assert.equal(model.lastIndex, 2)
  assert.equal(model.indexToPosition(2), 250)
  assert.equal(model.positionToIndex(249), 1)
  assert.equal(model.positionToIndex(250), 2)
  assert.equal(model.logicalPosition(250), 1 + 130 / 280)
  const capped = custom({ slides: model.slides, snapPoints: model.snapPoints, maxPosition: 120 })
  assert.equal(capped.lastIndex, 1)
  assert.equal(capped.indexToPosition(2), 120)
})

test('loop deltas use measured snaps and preserve directed and half-cycle choices', () => {
  const model = variable()
  assert.equal(model.normalize(-50), 350)
  assert.equal(model.normalize(850), 50)
  assert.equal(model.shortestDelta(0, 2), -100)
  assert.equal(model.directedDelta(0, 2, 1), 300)
  assert.equal(model.directedDelta(0, 2, -1), -100)
  assert.equal(model.shortestDelta(200, 0), 200)
  assert.equal(model.shortestDelta(-200, 0), 200)
  assert.throws(() => model.directedDelta(0, 2, 0), TypeError)
})

test('custom measurements and input descriptors cannot mutate the frozen geometry', () => {
  const meta = { width: 100, nested: { value: 1 } }
  const input = context(2, { slides: [{ index: 0, id: 'a', meta, content: 'not exposed' }, { index: 1 }] })
  const measurement = { slides: [{ offset: 0, size: 100 }, { offset: 100, size: 200 }], snapPoints: [0, 100] }
  let received
  const model = createNavigationGeometry(input, { name: 'snapshot', measure(value) { received = value; return measurement } })
  assert.ok(Object.isFrozen(received))
  assert.ok(Object.isFrozen(received.slides))
  assert.ok(Object.isFrozen(received.slides[0]))
  assert.ok(Object.isFrozen(received.slides[0].meta))
  assert.equal('content' in received.slides[0], false)
  assert.equal(Object.isFrozen(meta), false)
  meta.width = 300
  assert.equal(received.slides[0].meta.width, 100)
  measurement.slides[1].offset = 999
  measurement.snapPoints[1] = 999
  assert.equal(model.indexToPosition(1, true), 100)
  assert.ok(Object.isFrozen(model))
  assert.ok(Object.isFrozen(model.slides))
  assert.ok(Object.isFrozen(model.slides[0]))
  assert.ok(Object.isFrozen(model.snapPoints))
  assert.ok(Object.isFrozen(model.bounds))
  assert.throws(() => { model.maxPosition = 0 }, TypeError)
})

test('measured geometry rejects malformed, sparse, nonnumeric and ambiguous snaps', () => {
  const valid = [{ offset: 0, size: 100 }, { offset: 100, size: 100 }]
  const invalid = [
    null, [], {}, { slides: [] }, { slides: Array(2) },
    { slides: [valid[0], null] }, { slides: [valid[0], { offset: '100', size: 100 }] },
    { slides: [valid[0], { offset: 100, size: Infinity }] },
    { slides: [valid[0], { offset: -1, size: 100 }] },
    { slides: [{ offset: 10, size: 100 }, { offset: 0, size: 100 }] },
    { slides: valid, snapPoints: [0] }, { slides: valid, snapPoints: Array(2) },
    { slides: valid, snapPoints: null },
    { slides: valid, snapPoints: [1, 100] }, { slides: valid, snapPoints: [0, 0] },
    { slides: valid, snapPoints: [0, NaN] }, { slides: valid, snapPoints: [0, 300] },
    { slides: valid, loopLength: 0 }, { slides: valid, loopLength: 199 },
    { slides: valid, loopLength: Infinity }, { slides: valid, maxPosition: -1 },
    { slides: valid, loopLength: null }, { slides: valid, maxPosition: null },
    { slides: valid, maxPosition: 101 },
    { slides: [{ offset: Number.MAX_VALUE, size: Number.MAX_VALUE }, valid[1]] },
  ]
  for (const measurement of invalid) {
    assert.throws(() => createNavigationGeometry(context(2), { name: 'invalid', measure: () => measurement }),
      undefined, `measurement ${JSON.stringify(measurement)} must be rejected`)
  }
})

test('a fully degenerate custom result can retain repeated zero snaps', () => {
  const model = custom({ slides: [{ offset: 0, size: 0 }, { offset: 0, size: 0 }] })
  assert.equal(model.loopLength, 0)
  assert.equal(model.indexToPosition(1, true), 0)
  assert.equal(model.positionToIndex(20, true), 0)
  assert.throws(() => custom({ slides: model.slides, loopLength: 100 }), RangeError)
  assert.throws(() => custom({ slides: [], loopLength: 100 }), RangeError)
})

test('large finite cycles normalize and choose directed routes without addition overflow', () => {
  const unit = Number.MAX_VALUE / 4
  const model = custom({
    slides: [{ offset: 0, size: unit }, { offset: unit, size: unit }], loopLength: Number.MAX_VALUE,
  })
  assert.equal(model.normalize(unit * 3), unit * 3)
  assert.equal(model.normalize(-unit), unit * 3)
  assert.equal(model.directedDelta(0, 1, 1), unit)
  assert.equal(model.directedDelta(unit, 0, -1), -unit)
})

test('measurement context rejects sparse, reordered and coercive descriptors before calling user code', () => {
  let calls = 0
  const definition = { name: 'never', measure() { calls++; return { slides: [] } } }
  for (const invalid of [
    context(2, { slides: Array(2) }), context(2, { slides: [{ index: 1 }, { index: 0 }] }),
    context(1, { slides: [{ index: 0, id: false }] }), context(1, { slides: [{ index: 0, meta: [] }] }),
    context(1, { viewportSize: '100' }), context(1, { gap: NaN }), context(1, { slidesPerView: 0 }),
  ]) assert.throws(() => createNavigationGeometry(invalid, definition))
  assert.equal(calls, 0)
})

test('callback exceptions and asynchronous results are rejected synchronously', async () => {
  const error = new Error('measurement failed')
  assert.throws(() => createNavigationGeometry(context(), { name: 'throws', measure() { throw error } }),
    value => value === error)
  assert.throws(() => createNavigationGeometry(context(), { name: 'async', async measure() { throw error } }), TypeError)
  assert.throws(() => createNavigationGeometry(context(), { name: 'thenable', measure: () => ({ then() {} }) }), TypeError)
  await new Promise(resolve => setImmediate(resolve))
})

test('variable slots use measured sizes and promote originals with matching progress', () => {
  const model = variable()
  const descriptors = [0, 1, 2].map(index => ({ index }))
  const finite = model.getSlots(descriptors, 100)
  assert.deepEqual(finite.map(({ offset, size, progress }) => ({ offset, size, progress })), [
    { offset: -100, size: 80, progress: -1 },
    { offset: 0, size: 180, progress: 0 },
    { offset: 200, size: 100, progress: 1 },
  ])
  const copies = [...descriptors, ...descriptors.map(({ index }) => ({ index, copy: 1 }))]
  const slots = model.getSlots(copies, 200, true, 400)
  assert.equal(slots[0].offset, 200)
  assert.equal(slots[3].offset, -200)
  assert.equal(slots[0].progress, 1.5)
  assert.equal(slots[3].progress, -1.5)
  assert.equal(slots[0].isCopy, false)
  assert.equal(slots[3].isCopy, true)
  assert.equal(slots[1].size, 180)
})

test('numeric slots wrap variable slides only after their occupied interval leaves', () => {
  const model = variable()
  const descriptors = [0, 1, 2].map(index => ({ index }))
  const slots = model.getSlots(descriptors, 210, true)
  assert.deepEqual(slots.map(slot => slot.offset), [190, -110, 90])
  assert.equal(slots[0].progress, 1.45)
  assert.equal(slots[1].progress, -.55)
})

test('LoopEngine accepts immutable geometry while preserving the legacy DOM slot shape', () => {
  const model = variable()
  const engine = new LoopEngine(model)
  const nodes = Array.from({ length: 6 }, (_, slot) => ({
    dataset: { index: String(slot % 3), ...(slot >= 3 ? { carouselCopy: '1' } : {}) }, style: {},
  }))
  assert.equal(engine.count, 3)
  assert.equal(engine.loopLength, 400)
  assert.equal(engine.toIndex(200), 2)
  assert.equal(engine.shortestDelta(0, 2), -100)
  const slots = engine.getSlots(nodes, 200, 400)
  assert.deepEqual(Object.keys(slots[0]).sort(), ['copy', 'logical', 'slide', 'x'])
  assert.equal(slots[0].slide, nodes[0])
  assert.equal(slots[0].x, 200)
  engine.positionSlides(nodes, 200, 400, 0, 'vertical')
  assert.equal(nodes[0].style.transform, 'translate3d(0, 200px, 0)')
  engine.update(3, 100)
  assert.equal(engine.loopLength, 300)
  engine.update(model)
  assert.equal(engine.loopLength, 400)
})

test('legacy slideWidth affects promotion only, preserving wrap positions for overlapping slides', () => {
  const engine = new LoopEngine(4, 100)
  const nodes = Array.from({ length: 4 }, (_, index) => ({ dataset: { index: String(index) }, style: {} }))
  assert.deepEqual(engine.getSlots(nodes, 50, 300, 150).map(slot => slot.x), [-50, 50, 150, 250])
})

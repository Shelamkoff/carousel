import test from 'node:test'
import assert from 'node:assert/strict'
import { LoopEngine } from '../src/LoopEngine.js'

function slides(count, copies = 0) {
  return Array.from({ length: count * (copies + 1) }, (_, slot) => ({
    dataset: { index: String(slot % count), ...(slot >= count ? { carouselCopy: String(Math.floor(slot / count)) } : {}) },
    style: {},
  }))
}

function positions(nodes) {
  return nodes.map(node => Number(node.style.transform.match(/translate3d\((-?[\d.]+)px/)?.[1]))
}

function assertFilled(nodes, viewWidth, slideWidth) {
  const xs = positions(nodes)
  for (let x = 0; x < viewWidth; x += 1) {
    assert.ok(xs.some(left => left <= x + 0.5 && left + slideWidth >= x + 0.5),
      `visible gap at pixel ${x}, positions: ${xs}`)
  }
}

test('multi-slide loops remain filled across wraparound', () => {
  const loop = new LoopEngine(4, 100)
  const nodes = slides(4)
  for (const pos of [0, 50, 150, 250, 399.5, -50, 850]) {
    loop.positionSlides(nodes, pos)
    assertFilled(nodes, 300, 100)
  }
})

test('visual copies fill a loop as short as the viewport', () => {
  const loop = new LoopEngine(3, 100)
  const nodes = slides(3, 1)
  for (const pos of [0, 50, 150, 250, 299, -25]) {
    loop.positionSlides(nodes, pos)
    assertFilled(nodes, 300, 100)
  }
})

test('directed navigation preserves forward/backward travel on ties and page moves', () => {
  const two = new LoopEngine(2, 100)
  assert.equal(two.directedDelta(0, 1, 1), 100)
  assert.equal(two.directedDelta(0, 1, -1), -100)
  const pages = new LoopEngine(5, 100)
  assert.equal(pages.shortestDelta(0, 3), -200)
  assert.equal(pages.directedDelta(0, 3, 1), 300)
  assert.equal(pages.directedDelta(0, 3, -1), -200)
  assert.throws(() => pages.directedDelta(0, 1, 0), TypeError)
})

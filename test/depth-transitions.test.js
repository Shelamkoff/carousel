import test from 'node:test'
import assert from 'node:assert/strict'
import { depthTransitionPresets } from '../src/transitions/depth.js'

function fixture(width = 600.5, height = 320.25, scale = 1) {
  let reads = 0
  const document = {
    defaultView: {
      getComputedStyle() {
        reads++
        return { width: `${width}px`, height: `${height}px` }
      },
    },
    createElement() {
      return {
        ownerDocument: document, style: {}, children: [],
        appendChild(child) { this.children.push(child) },
      }
    },
  }
  const container = document.createElement('div')
  container.getBoundingClientRect = () => {
    reads++
    return { width: width * scale, height: height * scale }
  }
  return { container, width, height, reads: () => reads }
}

function length(value, size) {
  const calculated = value.match(/^calc\(([-\d.]+)% ([+-]) ([-\d.]+)px\)$/)
  if (calculated) return Number(calculated[1]) * size / 100 + (calculated[2] === '+' ? 1 : -1) * Number(calculated[3])
  return Number.parseFloat(value) * (value.endsWith('%') ? size / 100 : 1)
}

function covered(surface, x, y) {
  return surface.container.children.some(({ style }) => {
    if (Number(style.opacity) < 1e-12 || style.background === 'transparent') return false
    const left = length(style.left, surface.width)
    const top = length(style.top, surface.height)
    const width = length(style.width, surface.width)
    const height = length(style.height, surface.height)
    if (style.borderRadius === '50%') {
      const scale = Number(style.transform.match(/scale\(([^)]+)\)/)[1])
      return Math.hypot(x - (left + width / 2), y - (top + height / 2)) <= width * scale / 2
    }
    // Only a face-on opaque panel can conceal the slide at the commit boundary.
    const angle = Number(style.transform.match(/rotateY\(([^)]+)deg\)/)[1])
    if (angle !== 0) return false
    const epsilon = 1e-9
    return x >= left - epsilon && x <= left + width + epsilon && y >= top - epsilon && y <= top + height + epsilon
  })
}

for (const [name, count] of [['grid-flip', 32], ['doorway', 2], ['water-drop', 4]]) {
  test(`${name} covers fractional wide and tall viewports at commit and renders within a bounded budget`, () => {
    for (const [width, height] of [[1200.75, 133.5], [173.5, 901.25], [331.25, 331.25]]) {
      for (const direction of [1, -1]) {
        const surface = fixture(width, height)
        const instance = depthTransitionPresets[name].create(Object.freeze({ container: surface.container, direction }))
        const readsAtCreation = surface.reads()
        assert.equal(surface.container.children.length, count)
        assert.ok(count <= 32)
        assert.ok(readsAtCreation <= 1)
        for (const progress of [0, 0.5, 1]) {
          instance.render(progress)
          for (let column = 0; column <= 16; column++) {
            for (let row = 0; row <= 8; row++) {
              assert.equal(covered(surface, width * column / 16, height * row / 8), progress === 0.5,
                `${name}: ${width}×${height}, ${direction}, progress ${progress}, point ${column},${row}`)
            }
          }
          if (progress !== 0.5) {
            assert.ok(surface.container.children.every(node => Number(node.style.opacity) < 1e-12))
          }
        }
        for (let frame = 0; frame <= 120; frame++) {
          instance.render(frame / 120)
          for (const node of surface.container.children) {
            assert.ok(Object.values(node.style).every(value => !/NaN|Infinity|undefined/.test(value)))
            assert.ok(Number(node.style.opacity) >= 0 && Number(node.style.opacity) <= 1)
          }
        }
        assert.equal(surface.reads(), readsAtCreation)
        assert.deepEqual(surface.container.style, {})
      }
    }
  })
}

test('depth descriptors are reusable and reverse the grid stagger and door rotation without shared state', () => {
  assert.ok(Object.isFrozen(depthTransitionPresets))
  for (const [name, definition] of Object.entries(depthTransitionPresets)) {
    assert.ok(Object.isFrozen(definition))
    assert.equal(definition.name, name)
    const forward = fixture()
    const backward = fixture()
    const a = definition.create({ container: forward.container, direction: 1 })
    const b = definition.create({ container: backward.container, direction: -1 })
    a.render(0.25)
    b.render(0.25)
    if (name !== 'water-drop') {
      const angle = piece => Number(piece.style.transform.match(/rotateY\(([^)]+)deg\)/)[1])
      const reversed = name === 'grid-flip' ? [...backward.container.children].reverse() : backward.container.children
      forward.container.children.forEach((piece, index) => {
        assert.ok(Math.abs(angle(piece) + angle(reversed[index])) < 1e-10)
      })
    }
    const stable = backward.container.children.map(piece => ({ ...piece.style }))
    a.render(0.8)
    assert.deepEqual(backward.container.children.map(piece => piece.style), stable)
    assert.notEqual(forward.container.children[0], backward.container.children[0])
  }
})

test('water drop keeps circular coverage and distinct ripples inside scaled ancestors without remeasuring', () => {
  for (const [width, height] of [[1200.75, 133.5], [173.5, 901.25], [0, 0]]) {
    const normal = fixture(width, height)
    const scaled = fixture(width, height, 0.4)
    const a = depthTransitionPresets['water-drop'].create({ container: normal.container, direction: 1 })
    const b = depthTransitionPresets['water-drop'].create({ container: scaled.container, direction: 1 })
    assert.equal(normal.reads(), 1)
    assert.equal(scaled.reads(), 1)
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      a.render(progress)
      b.render(progress)
      assert.deepEqual(scaled.container.children.map(piece => piece.style), normal.container.children.map(piece => piece.style))
      assert.ok(scaled.container.children.every(piece => piece.style.width === piece.style.height))
      if (progress === 0.25) {
        const rings = scaled.container.children.slice(1)
        assert.equal(new Set(rings.map(ring => ring.style.transform)).size, 3)
        assert.ok(rings.every(ring => ring.style.background === 'transparent' && Number(ring.style.opacity) > 0))
      }
    }
    assert.equal(normal.reads(), 1)
    assert.equal(scaled.reads(), 1)
  }
})

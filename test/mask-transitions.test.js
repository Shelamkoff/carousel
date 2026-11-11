import test from 'node:test'
import assert from 'node:assert/strict'
import { maskTransitionPresets } from '../src/transitions/masks.js'

function fixture(width = 600.5, height = 320.25) {
  let reads = 0
  const document = {
    createElement() {
      return {
        ownerDocument: document,
        style: {}, children: [],
        appendChild(child) { this.children.push(child) },
      }
    },
  }
  const container = document.createElement('div')
  container.getBoundingClientRect = () => {
    reads++
    return { width, height }
  }
  return { container, width, height, reads: () => reads }
}

function polygonContains(path, x, y) {
  const points = path.replace(/^polygon\((?:evenodd, )?/, '').slice(0, -1)
    .split(',').map(point => point.trim().split(/\s+/).map(Number.parseFloat))
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [ax, ay] = points[index]
    const [bx, by] = points[previous]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

function covered({ container, width, height }, x, y) {
  return container.children.some(({ style }) => {
    if (style.opacity === '0') return false
    if (style.borderRadius === '50%') {
      const scale = Number(style.transform.match(/scale\(([^)]+)\)/)[1])
      if (scale === 0) return false
      const centerX = Number.parseFloat(style.left) / 100 * width
      const centerY = Number.parseFloat(style.top) / 100 * height
      return Math.hypot(x / 100 * width - centerX, y / 100 * height - centerY)
        <= Number.parseFloat(style.width) * scale / 2
    }
    return style.clipPath === 'none' || polygonContains(style.clipPath, x, y)
  })
}

for (const name of Object.keys(maskTransitionPresets)) {
  test(`${name} is clear at both ends and fully covers fractional wide, tall and square viewports at commit`, () => {
    for (const [width, height] of [[1200.75, 133.5], [173.5, 901.25], [331.25, 331.25]]) {
      for (const direction of [1, -1]) {
        const surface = fixture(width, height)
        const instance = maskTransitionPresets[name].create(Object.freeze({ container: surface.container, direction }))
        for (const progress of [0, 0.5, 1]) {
          instance.render(progress)
          for (let x = 0; x <= 100; x += 5) {
            for (let y = 0; y <= 100; y += 5) {
              assert.equal(covered(surface, x, y), progress === 0.5, `${width}×${height}, ${direction}, ${progress}, ${x},${y}`)
            }
          }
        }
      }
    }
  })

  test(`${name} allocates bounded decorative nodes and never measures layout during rendering`, () => {
    const surface = fixture()
    const instance = maskTransitionPresets[name].create({ container: surface.container, direction: 1 })
    const initialReads = surface.reads()
    const collect = node => [node, ...node.children.flatMap(collect)]
    const nodes = surface.container.children.flatMap(collect)
    assert.ok(nodes.length > 0 && nodes.length <= 64)
    assert.ok(initialReads <= 1)
    for (let frame = 0; frame <= 120; frame++) {
      instance.render(frame / 120)
      for (const node of nodes) {
        assert.ok(Object.values(node.style).every(value => !/NaN|Infinity|undefined/.test(value)))
      }
    }
    assert.equal(surface.reads(), initialReads)
    assert.deepEqual(surface.container.style, {})
    assert.ok(surface.container.children.every(piece => piece.style.background === 'var(--carousel-transition-color, #17181b)'))
  })
}

test('mask definitions can be reused independently without shared mutable frame state', () => {
  assert.ok(Object.isFrozen(maskTransitionPresets))
  for (const [name, definition] of Object.entries(maskTransitionPresets)) {
    assert.ok(Object.isFrozen(definition))
    assert.equal(definition.name, name)
    const a = fixture()
    const b = fixture()
    const first = definition.create({ container: a.container, direction: 1 })
    const second = definition.create({ container: b.container, direction: -1 })
    second.render(0.5)
    const stable = b.container.children.map(piece => ({ ...piece.style }))
    first.render(0.2)
    assert.deepEqual(b.container.children.map(piece => piece.style), stable)
    assert.notEqual(a.container.children[0], b.container.children[0])
  }
})

test('directional wipe enters from one edge and exits through the opposite edge, mirrored backwards', () => {
  for (const direction of [1, -1]) {
    const surface = fixture()
    const instance = maskTransitionPresets['directional-wipe'].create({ container: surface.container, direction })
    const entry = direction === 1 ? 20 : 80
    const exit = 100 - entry
    instance.render(0.25)
    assert.equal(covered(surface, entry, 50), true)
    assert.equal(covered(surface, exit, 50), false)
    instance.render(0.75)
    assert.equal(covered(surface, entry, 50), false)
    assert.equal(covered(surface, exit, 50), true)
  }
})

test('clock wipe sweeps both halves of the viewport in order and reverses its rotation', () => {
  for (const direction of [1, -1]) {
    const surface = fixture(901.5, 173.25)
    const instance = maskTransitionPresets['clock-wipe'].create({ container: surface.container, direction })
    const firstHalf = direction === 1 ? 75 : 25
    const lastHalf = 100 - firstHalf
    instance.render(0.25)
    assert.equal(covered(surface, firstHalf, 50), true)
    assert.equal(covered(surface, lastHalf, 50), false)
    instance.render(0.75)
    assert.equal(covered(surface, firstHalf, 50), false)
    assert.equal(covered(surface, lastHalf, 50), true)
  }
})

test('diamond grows from the center while the six-blade aperture closes around a transparent center', () => {
  const diamond = fixture(400, 400)
  const aperture = fixture(400, 400)
  const diamondInstance = maskTransitionPresets['diamond-wipe'].create({ container: diamond.container, direction: 1 })
  const apertureInstance = maskTransitionPresets['aperture-wipe'].create({ container: aperture.container, direction: 1 })
  diamondInstance.render(0.25)
  apertureInstance.render(0.25)
  assert.equal(covered(diamond, 50, 50), true)
  assert.equal(covered(diamond, 1, 1), false)
  assert.equal(covered(aperture, 50, 50), false)
  assert.equal(covered(aperture, 1, 1), true)
  const closing = aperture.container.children[0].style.clipPath
  apertureInstance.render(0.75)
  assert.notEqual(aperture.container.children[0].style.clipPath, closing)
  assert.equal(covered(aperture, 50, 50), false)
})

test('polka dots use real circles large enough to cover every cell and reverse their stagger', () => {
  const forward = fixture()
  const backward = fixture()
  const a = maskTransitionPresets['polka-dots'].create({ container: forward.container, direction: 1 })
  const b = maskTransitionPresets['polka-dots'].create({ container: backward.container, direction: -1 })
  a.render(0.15)
  b.render(0.15)
  const firstRow = forward.container.children.filter(piece => piece.style.top === forward.container.children[0].style.top)
  const last = firstRow.length - 1
  assert.notEqual(firstRow[0].style.transform, firstRow[last].style.transform)
  for (let index = 0; index <= last; index++) {
    assert.equal(firstRow[index].style.transform, backward.container.children[last - index].style.transform)
    assert.equal(firstRow[index].style.width, firstRow[index].style.height)
  }
})

test('zero-sized containers produce finite geometry without additional observers or timers', () => {
  for (const definition of Object.values(maskTransitionPresets)) {
    const surface = fixture(0, 0)
    const instance = definition.create({ container: surface.container, direction: 1 })
    for (const progress of [0, 0.125, 0.5, 0.875, 1]) {
      instance.render(progress)
      assert.ok(surface.container.children.every(piece => Object.values(piece.style).every(value => !/NaN|Infinity/.test(value))))
    }
  }
})

test('size-dependent masks measure CSS pixels, preserving geometry inside transformed ancestors', () => {
  for (const name of ['clock-wipe', 'aperture-wipe', 'polka-dots']) {
    const normal = fixture(600.5, 320.25)
    const scaled = fixture(600.5, 320.25)
    let styleReads = 0
    scaled.container.ownerDocument.defaultView = {
      getComputedStyle() {
        styleReads++
        return { width: '600.5px', height: '320.25px' }
      },
    }
    scaled.container.getBoundingClientRect = () => { throw new Error('visual bounds must not replace CSS geometry') }
    const a = maskTransitionPresets[name].create({ container: normal.container, direction: 1 })
    const b = maskTransitionPresets[name].create({ container: scaled.container, direction: 1 })
    for (const progress of [0, 0.125, 0.5, 0.875, 1]) {
      a.render(progress)
      b.render(progress)
      assert.deepEqual(scaled.container.children.map(piece => piece.style), normal.container.children.map(piece => piece.style))
    }
    assert.equal(styleReads, 1)
  }
})

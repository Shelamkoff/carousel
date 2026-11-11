import { getViewportSize } from './geometry.js'

const clamp = value => Math.max(0, Math.min(value, 1))
const ease = value => value < 0.5
  ? 4 * value * value * value
  : 1 - Math.pow(-2 * value + 2, 3) / 2
const color = 'var(--carousel-transition-color, #17181b)'
const turn = Math.PI * 2

function phaseAt(progress) {
  const revealing = progress >= 0.5
  const amount = ease(clamp(revealing ? (progress - 0.5) * 2 : progress * 2))
  return { revealing, amount, coverage: revealing ? 1 - amount : amount }
}

function createPiece(container, styles = {}) {
  const document = container.ownerDocument ?? globalThis.document
  const piece = document.createElement('div')
  piece.className = 'carousel__transition-piece'
  Object.assign(piece.style, {
    position: 'absolute', inset: '0', background: color,
    willChange: 'clip-path', ...styles,
  })
  container.appendChild(piece)
  return piece
}

function polygon(points, direction = 1) {
  return `polygon(${points.map(([x, y]) => `${direction === -1 ? 100 - x : x}% ${y}%`).join(', ')})`
}

function setMask(piece, coverage, clipPath) {
  piece.style.opacity = coverage === 0 ? '0' : '1'
  // The exact commit boundary has no clipped edge or antialiasing seam.
  piece.style.clipPath = coverage === 1 ? 'none' : clipPath
}

function createDiamond({ container }) {
  const piece = createPiece(container)
  return {
    render(progress) {
      const { coverage } = phaseAt(progress)
      const radius = 100 * coverage
      setMask(piece, coverage, polygon([
        [50, 50 - radius], [50 + radius, 50],
        [50, 50 + radius], [50 - radius, 50],
      ]))
    },
  }
}

function createDirectional({ container, direction }) {
  const piece = createPiece(container)
  return {
    render(progress) {
      const { revealing, amount, coverage } = phaseAt(progress)
      const top = -25 + 125 * amount
      const bottom = 125 * amount
      const points = revealing
        ? [[top, 0], [100, 0], [100, 100], [bottom, 100]]
        : [[0, 0], [top, 0], [bottom, 100], [0, 100]]
      setMask(piece, coverage, polygon(points, direction))
    },
  }
}

function createClock({ container, direction }) {
  const piece = createPiece(container)
  const { width, height } = getViewportSize(container)
  const cornerAngle = Math.atan2(width, height)
  const corners = [
    { point: [100, 0], angle: cornerAngle },
    { point: [100, 100], angle: Math.PI - cornerAngle },
    { point: [0, 100], angle: Math.PI + cornerAngle },
    { point: [0, 0], angle: turn - cornerAngle },
  ]
  return {
    render(progress) {
      const { revealing, amount, coverage } = phaseAt(progress)
      const angle = amount * turn
      const x = Math.sin(angle)
      const y = -Math.cos(angle)
      const distance = Math.min(width / (2 * Math.abs(x)), height / (2 * Math.abs(y)))
      const edge = [50 + x * distance / width * 100, 50 + y * distance / height * 100]
      const points = revealing
        ? [[50, 50], edge, ...corners.filter(corner => corner.angle > angle).map(corner => corner.point), [50, 0]]
        : [[50, 50], [50, 0], ...corners.filter(corner => corner.angle < angle).map(corner => corner.point), edge]
      setMask(piece, coverage, polygon(points, direction))
    },
  }
}

function createAperture({ container, direction }) {
  const piece = createPiece(container)
  const { width, height } = getViewportSize(container)
  // A rotating regular hexagon must contain the viewport at every angle when
  // fully open. The incircle, rather than a vertex, sets that outer radius.
  const outerRadius = (Math.hypot(width, height) / 2 + 1) / Math.cos(Math.PI / 6)
  const document = container.ownerDocument ?? globalThis.document
  const blades = Array.from({ length: 6 }, () => {
    const blade = document.createElement('div')
    Object.assign(blade.style, {
      position: 'absolute', left: '50%', top: '50%',
      width: `${outerRadius}px`, height: '1px',
      background: 'var(--carousel-transition-highlight, rgba(255, 255, 255, 0.18))',
      transformOrigin: '0 50%', willChange: 'transform',
    })
    piece.appendChild(blade)
    return blade
  })
  return {
    render(progress) {
      const { coverage } = phaseAt(progress)
      const radius = outerRadius * (1 - coverage)
      const rotation = direction * (Math.PI / 6 + progress * Math.PI / 3)
      const hole = blades.map((blade, index) => {
        const angle = rotation + index * Math.PI / 3
        blade.style.transform = `rotate(${angle}rad)`
        return `${50 + Math.cos(angle) * radius / width * 100}% ${50 + Math.sin(angle) * radius / height * 100}%`
      })
      // Traverse the outer contour and the inner contour with a doubled bridge.
      // evenodd leaves a real transparent hexagonal aperture in the opaque layer.
      const clipPath = `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${hole.join(', ')}, ${hole[0]}, 0% 0%)`
      setMask(piece, coverage, clipPath)
    },
  }
}

function createPolkaDots({ container, direction }) {
  const { width, height } = getViewportSize(container)
  const columns = Math.min(8, Math.max(1, Math.round(8 * width / height)))
  const rows = Math.min(8, Math.max(1, Math.round(8 * height / width)))
  const cellWidth = width / columns
  const cellHeight = height / rows
  const diameter = Math.hypot(cellWidth, cellHeight) + 1
  const farthest = Math.hypot((columns - 1) * cellWidth, (rows - 1) * cellHeight) || 1
  const dots = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const rank = Math.hypot((direction === -1 ? columns - 1 - column : column) * cellWidth, row * cellHeight) / farthest
    const piece = createPiece(container, {
      inset: 'auto',
      left: `${(column + 0.5) * 100 / columns}%`,
      top: `${(row + 0.5) * 100 / rows}%`,
      width: `${diameter}px`, height: `${diameter}px`, borderRadius: '50%',
      transformOrigin: '50% 50%', willChange: 'transform',
    })
    return { piece, rank }
  })
  return {
    render(progress) {
      const revealing = progress >= 0.5
      const phase = clamp(revealing ? (progress - 0.5) * 2 : progress * 2)
      for (const { piece, rank } of dots) {
        const amount = ease(clamp((phase - rank * 0.4) / 0.6))
        const scale = revealing ? 1 - amount : amount
        piece.style.transform = `translate(-50%, -50%) scale(${scale})`
      }
    },
  }
}

export const maskTransitionPresets = Object.freeze(Object.fromEntries([
  ['diamond-wipe', createDiamond],
  ['directional-wipe', createDirectional],
  ['clock-wipe', createClock],
  ['aperture-wipe', createAperture],
  ['polka-dots', createPolkaDots],
].map(([name, create]) => [name, Object.freeze({ name, create })])))

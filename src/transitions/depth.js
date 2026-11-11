import { getViewportSize } from './geometry.js'

const clamp = value => Math.max(0, Math.min(value, 1))
const ease = value => value * value * (3 - 2 * value)
const color = 'var(--carousel-transition-color, #17181b)'
const highlight = 'var(--carousel-transition-highlight, rgba(255, 255, 255, 0.18))'

function phaseAt(progress, rank = 0, stagger = 0) {
  const revealing = progress >= 0.5
  const phase = clamp(revealing ? (progress - 0.5) * 2 : progress * 2)
  const amount = ease(clamp((phase - rank * stagger) / (1 - stagger)))
  return { revealing, coverage: revealing ? 1 - amount : amount }
}

function piece(container, style) {
  const node = container.ownerDocument.createElement('div')
  node.className = 'carousel__transition-piece'
  Object.assign(node.style, { position: 'absolute', background: color }, style)
  container.appendChild(node)
  return node
}

function createGridFlip({ container, direction }) {
  const columns = 8
  const rows = 4
  const pieces = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      pieces.push({
        rank: (column + row) / (columns + rows - 2),
        node: piece(container, {
          left: `${column * 100 / columns}%`, top: `${row * 100 / rows}%`,
          width: `calc(${100 / columns}% + 0.5px)`,
          height: `calc(${100 / rows}% + 0.5px)`,
          backfaceVisibility: 'hidden', transformOrigin: 'center',
          boxShadow: `inset 0 0 0 1px ${highlight}`,
          willChange: 'transform',
        }),
      })
    }
  }
  return {
    render(progress) {
      for (const { node, rank } of pieces) {
        const { revealing, coverage } = phaseAt(progress, direction === 1 ? rank : 1 - rank, 0.35)
        const angle = (1 - coverage) * 90 * direction * (revealing ? -1 : 1)
        node.style.transform = `perspective(900px) rotateY(${angle}deg)`
        // A rotated edge can still rasterize as a one-pixel line.
        node.style.opacity = coverage === 0 ? '0' : '1'
      }
    },
  }
}

function createDoorway({ container, direction }) {
  const pieces = [0, 1].map(index => piece(container, {
    top: '0', left: `${index * 50}%`, width: 'calc(50% + 0.5px)', height: '100%',
    transformOrigin: index === 0 ? 'left center' : 'right center',
    backfaceVisibility: 'hidden', willChange: 'transform',
    backgroundImage: `linear-gradient(${index === 0 ? 90 : 270}deg, transparent, ${highlight})`,
  }))
  return {
    render(progress) {
      const { coverage } = phaseAt(progress)
      pieces.forEach((node, index) => {
        const angle = (1 - coverage) * 90 * (index === 0 ? -1 : 1) * direction
        node.style.transform = `perspective(1000px) rotateY(${angle}deg)`
        node.style.opacity = coverage === 0 ? '0' : '1'
      })
    },
  }
}

function createWaterDrop({ container, direction }) {
  // Measure once. Carousel settles and disposes the effect before a resize.
  const { width, height } = getViewportSize(container)
  const radius = Math.hypot(width, height) / 2 + 1
  const geometry = {
    left: `calc(50% - ${radius}px)`, top: `calc(50% - ${radius}px)`,
    width: `${radius * 2}px`, height: `${radius * 2}px`,
    borderRadius: '50%', transformOrigin: 'center', willChange: 'transform',
  }
  const disk = piece(container, geometry)
  const rings = Array.from({ length: 3 }, (_, index) => piece(container, {
    ...geometry,
    background: 'transparent',
    border: `${2 + index}px solid ${highlight}`,
    boxSizing: 'border-box',
  }))
  return {
    render(progress) {
      const { revealing, coverage } = phaseAt(progress)
      disk.style.transform = `scale(${coverage})`
      disk.style.opacity = coverage === 0 ? '0' : '1'
      const phase = clamp(revealing ? (progress - 0.5) * 2 : progress * 2)
      for (let index = 0; index < rings.length; index++) {
        const wave = clamp((phase - index * 0.12) / (1 - index * 0.12))
        const scale = direction === 1 ? wave : 1 - wave
        rings[index].style.transform = `scale(${scale})`
        rings[index].style.opacity = String(Math.sin(Math.PI * wave) * 0.7)
      }
    },
  }
}

// Decorative counterparts of image-only shader effects. They never snapshot,
// clone or move live slide content, and work without a GPU/WebGL context.
export const depthTransitionPresets = Object.freeze(Object.fromEntries([
  ['grid-flip', createGridFlip],
  ['doorway', createDoorway],
  ['water-drop', createWaterDrop],
].map(([name, create]) => [name, Object.freeze({ name, create })])))

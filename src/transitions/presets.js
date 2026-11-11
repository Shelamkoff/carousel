import { maskTransitionPresets } from './masks.js'
import { depthTransitionPresets } from './depth.js'

const clamp = value => Math.max(0, Math.min(value, 1))
const ease = value => value < 0.5
  ? 4 * value * value * value
  : 1 - Math.pow(-2 * value + 2, 3) / 2

// A fixed shuffle keeps pixel order deterministic without consuming application
// randomness or depending on rendering speed.
const pixelRanks = (() => {
  const order = Array.from({ length: 64 }, (_, index) => index)
  let seed = 0x6d2b79f5
  for (let i = order.length - 1; i > 0; i--) {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    const j = (seed >>> 0) % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const ranks = []
  order.forEach((index, rank) => { ranks[index] = rank })
  return ranks
})()

function phaseAt(progress, rank = 0, lastRank = 1, stagger = 0.4) {
  const revealing = progress >= 0.5
  const phase = clamp(revealing ? (progress - 0.5) * 2 : progress * 2)
  const amount = ease(clamp((phase - rank / lastRank * stagger) / (1 - stagger)))
  return { revealing, amount, offset: (revealing ? amount : 1 - amount) * 100 }
}

const panels = {
  stairs: {
    columns: 8, rows: 1, willChange: 'transform',
    state(index, progress, backwards) {
      const { revealing, offset } = phaseAt(progress, backwards ? 7 - index : index, 7)
      return { x: 0, y: (revealing ? -offset : offset) || 0, opacity: 1 }
    },
  },
  'stairs-horizontal': {
    columns: 1, rows: 8, willChange: 'transform',
    state(index, progress, backwards) {
      const { revealing, offset } = phaseAt(progress, backwards ? 7 - index : index, 7)
      const direction = index % 2 === 0 ? 1 : -1
      return { x: ((revealing ? offset : -offset) * direction) || 0, y: 0, opacity: 1 }
    },
  },
  pixel: {
    columns: 8, rows: 8, willChange: 'opacity',
    state(index, progress) {
      const { revealing, amount } = phaseAt(progress, pixelRanks[index], 63)
      return { x: 0, y: 0, opacity: revealing ? 1 - amount : amount }
    },
  },
  curtain: {
    columns: 2, rows: 1, willChange: 'transform',
    state(index, progress) {
      const { offset } = phaseAt(progress, 0, 1, 0)
      return { x: (index === 0 ? -offset : offset) || 0, y: 0, opacity: 1 }
    },
  },
}

export function getPanelCount(variant) {
  if (!Object.hasOwn(panels, variant)) throw new TypeError('Unknown viewport transition')
  return panels[variant].columns * panels[variant].rows
}

export function getPanelState(variant, index, progress, backwards = false) {
  if (!Object.hasOwn(panels, variant)) throw new TypeError('Unknown viewport transition')
  return panels[variant].state(index, progress, backwards)
}

function createPanels(container, definition, direction) {
  const document = container.ownerDocument ?? globalThis.document
  const { columns, rows, state, willChange } = definition
  const pieces = []
  for (let index = 0; index < columns * rows; index++) {
    const piece = document.createElement('div')
    piece.className = 'carousel__transition-piece'
    Object.assign(piece.style, {
      position: 'absolute',
      top: `${Math.floor(index / columns) * 100 / rows}%`,
      left: `${(index % columns) * 100 / columns}%`,
      // The small overlap prevents seams at fractional viewport dimensions.
      width: columns === 1 ? '100%' : `calc(${100 / columns}% + 0.5px)`,
      height: rows === 1 ? '100%' : `calc(${100 / rows}% + 0.5px)`,
      background: 'var(--carousel-transition-color, #17181b)',
      willChange,
    })
    container.appendChild(piece)
    pieces.push(piece)
  }
  return {
    render(progress) {
      for (let index = 0; index < pieces.length; index++) {
        const { x, y, opacity } = state(index, progress, direction === -1)
        const piece = pieces[index]
        const transform = `translate3d(${x}%, ${y}%, 0)`
        const alpha = String(opacity)
        if (piece.style.transform !== transform) piece.style.transform = transform
        if (piece.style.opacity !== alpha) piece.style.opacity = alpha
      }
    },
  }
}

// Built-ins use the same contract as application-defined effects. Adding one
// does not add another branch to Carousel's navigation or animation controller.
export const viewportTransitionPresets = Object.freeze({
  ...Object.fromEntries(Object.entries(panels).map(([name, definition]) => [name, Object.freeze({
    name,
    create: ({ container, direction }) => createPanels(container, definition, direction),
  })])),
  ...maskTransitionPresets,
  ...depthTransitionPresets,
})

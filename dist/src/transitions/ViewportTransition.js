const clamp = value => Math.max(0, Math.min(value, 1))
const ease = value => value < 0.5
  ? 4 * value * value * value
  : 1 - Math.pow(-2 * value + 2, 3) / 2

// A fixed shuffle keeps the pixel effect deterministic across instances and
// renders. It does not consume application randomness or depend on timing.
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

export function isViewportTransition(variant) {
  return variant === 'stairs' || variant === 'pixel' || variant === 'curtain'
}

export function getPanelCount(variant) {
  if (variant === 'stairs') return 8
  if (variant === 'pixel') return 64
  if (variant === 'curtain') return 2
  throw new TypeError('Unknown viewport transition')
}

/**
 * Each half of the timeline ends at a complete state: fully covered at .5,
 * fully revealed at 1. The core changes the slide only at the covered boundary.
 */
export function getPanelState(variant, index, progress, backwards = false) {
  const revealing = progress >= 0.5
  const phase = clamp(revealing ? (progress - 0.5) * 2 : progress * 2)
  let rank = 0
  let lastRank = 1
  if (variant === 'stairs') {
    rank = backwards ? 7 - index : index
    lastRank = 7
  } else if (variant === 'pixel') {
    rank = pixelRanks[index]
    lastRank = 63
  }
  const stagger = variant === 'curtain' ? 0 : 0.4
  const amount = ease(clamp((phase - rank / lastRank * stagger) / (1 - stagger)))
  if (variant === 'pixel') return { x: 0, y: 0, opacity: revealing ? 1 - amount : amount }
  const offset = revealing ? amount * 100 : (1 - amount) * 100
  if (variant === 'curtain') return { x: (index === 0 ? -offset : offset) || 0, y: 0, opacity: 1 }
  return { x: 0, y: (revealing ? -offset : offset) || 0, opacity: 1 }
}

/**
 * Decorative panels only: no slide snapshots, clones, form controls, or media.
 * The Carousel owns the animation clock, cancellation, and navigation events.
 */
export class ViewportTransition {
  #overlay
  #pieces = []
  #variant
  #backwards

  constructor(viewport, variant, backwards = false) {
    this.#variant = variant
    this.#backwards = backwards
    const document = viewport.ownerDocument ?? globalThis.document
    const overlay = document.createElement('div')
    overlay.className = 'carousel__transition'
    overlay.dataset.transition = variant
    overlay.setAttribute('aria-hidden', 'true')
    overlay.inert = true
    Object.assign(overlay.style, {
      position: 'absolute', inset: '0', overflow: 'hidden',
      pointerEvents: 'none', zIndex: '1', contain: 'layout paint style',
    })
    this.#overlay = overlay
    const count = getPanelCount(variant)
    for (let index = 0; index < count; index++) {
      const piece = document.createElement('div')
      piece.className = 'carousel__transition-piece'
      const column = variant === 'pixel' ? index % 8 : index
      const columns = variant === 'curtain' ? 2 : 8
      Object.assign(piece.style, {
        position: 'absolute',
        top: variant === 'pixel' ? `${Math.floor(index / 8) * 12.5}%` : '0',
        left: `${column * 100 / columns}%`,
        // Adjacent panels overlap by a fraction of a CSS pixel so scaled or
        // fractional viewport sizes cannot expose seams at the commit frame.
        width: `calc(${100 / columns}% + 0.5px)`,
        height: variant === 'pixel' ? 'calc(12.5% + 0.5px)' : '100%',
        background: 'var(--carousel-transition-color, #17181b)',
        willChange: variant === 'pixel' ? 'opacity' : 'transform',
      })
      overlay.appendChild(piece)
      this.#pieces.push(piece)
    }
    this.render(0)
    viewport.appendChild(overlay)
  }

  render(progress) {
    for (let index = 0; index < this.#pieces.length; index++) {
      const state = getPanelState(this.#variant, index, progress, this.#backwards)
      const piece = this.#pieces[index]
      const transform = `translate3d(${state.x}%, ${state.y}%, 0)`
      const opacity = String(state.opacity)
      if (piece.style.transform !== transform) piece.style.transform = transform
      if (piece.style.opacity !== opacity) piece.style.opacity = opacity
    }
  }

  destroy() {
    this.#overlay?.remove()
    this.#overlay = null
    this.#pieces = []
  }
}

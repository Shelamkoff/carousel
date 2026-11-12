function optionsFor(options, fallback) {
  const name = options.name === undefined ? fallback : options.name
  const commitAt = options.commitAt === undefined ? 1 : options.commitAt
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('Carousel: a surface transition needs a name')
  if (!Number.isFinite(commitAt) || commitAt < 0 || commitAt > 1) {
    throw new RangeError('Carousel: surface transition commitAt must be between 0 and 1')
  }
  return { kind: 'surfaces', name, commitAt }
}

/** A reference implementation using only the public two-surface contract. */
export function createSurfaceCrossfade(options = {}) {
  return {
    ...optionsFor(options, 'surface-crossfade'),
    createSurfaces({ container, from, to }) {
      container.style.isolation = 'isolate'
      from.style.mixBlendMode = 'plus-lighter'
      to.style.mixBlendMode = 'plus-lighter'
      return { render(progress) {
        from.style.opacity = String(1 - progress)
        to.style.opacity = String(progress)
      } }
    },
  }
}

/** A single outgoing page reveals the destination without an opaque cover. */
export function createSurfacePageTurn(options = {}) {
  const definition = optionsFor(options, 'surface-page-turn')
  const perspective = options.perspective === undefined ? 1200 : options.perspective
  if (!Number.isFinite(perspective) || perspective <= 0) {
    throw new RangeError('Carousel: surface page-turn perspective must be positive')
  }
  return {
    ...definition,
    createSurfaces({ container, from, to, direction, orientation }) {
      const vertical = orientation === 'vertical'
      container.style.perspective = `${perspective}px`
      from.style.transformOrigin = vertical ? `center ${direction > 0 ? 'top' : 'bottom'}`
        : `${direction > 0 ? 'left' : 'right'} center`
      from.style.backfaceVisibility = 'hidden'
      from.style.zIndex = '2'
      to.style.zIndex = '1'
      return { render(progress) {
        const eased = progress * progress * (3 - 2 * progress)
        const angle = (vertical ? 1 : -1) * direction * 90 * eased
        from.style.transform = `rotate${vertical ? 'X' : 'Y'}(${angle}deg)`
        from.style.opacity = progress === 1 ? '0' : '1'
        from.style.filter = `brightness(${1 - Math.sin(progress * Math.PI) * .2})`
      } }
    },
  }
}

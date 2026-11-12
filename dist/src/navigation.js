/**
 * Last logical destination for finite navigation, including a partial page.
 * A fractional view below one must never expose an index past the slide array.
 * @param {number} count
 * @param {number} slidesPerView
 * @returns {number}
 */
export function getLastSlideIndex(count, slidesPerView) {
  return Math.max(0, Math.min(count - 1, Math.ceil(count - slidesPerView)))
}

/** Navigation policy consumes one physical model, shared by controls and gestures. */
export function getNavigationTarget(geometry, options, fromIndex, direction) {
  if (direction !== 1 && direction !== -1) throw new TypeError('Carousel: navigation direction must be 1 or -1')
  if (!Number.isInteger(fromIndex)) throw new TypeError('Carousel: navigation origin must be an integer')
  const count = geometry?.count ?? 0
  if (!count) return 0
  const loop = options.loop ?? false
  const origin = loop ? ((fromIndex % count) + count) % count
    : Math.max(0, Math.min(fromIndex, geometry.lastIndex))
  if (options.slidesPerScroll === 'auto' && !geometry.uniform) {
    const position = geometry.indexToPosition(origin, loop) + direction * geometry.viewportSize
    let target = geometry.positionToIndex(position, loop)
    // A page narrower than one large card still advances to a distinct card.
    if (target === origin && geometry.viewportSize < geometry.loopLength) target += direction
    return loop ? ((target % count) + count) % count
      : Math.max(0, Math.min(target, geometry.lastIndex))
  }
  const step = options.slidesPerScroll === 'auto'
    ? Math.max(1, Math.floor(options.slidesPerView ?? 1)) : options.slidesPerScroll ?? 1
  const target = origin + direction * (loop ? step % count : step)
  return loop ? ((target % count) + count) % count
    : Math.max(0, Math.min(target, geometry.lastIndex))
}

/** A loop may have a shorter page cycle than its logical slide collection. */
export function getPageTargets(geometry, options, anchorIndex = 0) {
  if (!geometry?.count) return []
  const loop = options.loop ?? false
  let index = loop ? ((anchorIndex % geometry.count) + geometry.count) % geometry.count : 0
  const targets = []
  const visited = new Set()
  while (!visited.has(index)) {
    targets.push(index)
    visited.add(index)
    if (!loop && index === geometry.lastIndex) break
    index = getNavigationTarget(geometry, options, index, 1)
  }
  return targets
}

/**
 * Pure main-axis geometry for an expanding, position-first carousel.
 * Exactly one logical slide is active; the visible preview count controls
 * how the active card shares space with narrower neighboring cards.
 */
export function getExpandGeometry(position, viewportSize, visible, ratio, peek, gap, count, loop) {
  const edge = Math.min(peek, viewportSize / 4)
  const rest = visible - 1
  const compact = Math.max(0, (viewportSize - edge - rest * gap) / (ratio + rest))
  const growth = compact * (ratio - 1)
  const anchorIndex = Math.floor(position)
  const phase = position - anchorIndex
  const currentSize = compact + growth * (1 - phase)
  let anchor = edge - phase * (currentSize + gap)

  // A finite final slide has no following card. Shift the group so the
  // previous card remains in view instead of leaving an empty trailing edge.
  if (!loop && count > 0) {
    const endProgress = Math.max(0, Math.min(1, position - (count - 2)))
    const endAnchor = Math.max(edge, viewportSize - edge - (compact + growth))
    anchor += (endAnchor - edge) * endProgress
  }
  return { position, compact, growth, gap, anchor, anchorIndex, phase }
}

/** O(1) slot calculation: only the two slides around the focus can grow. */
export function getExpandSlot(geometry, virtualIndex) {
  const { position, compact, growth, gap, anchor, anchorIndex, phase } = geometry
  const distance = virtualIndex - anchorIndex
  const focus = Math.max(0, 1 - Math.abs(virtualIndex - position))
  const offset = anchor + distance * (compact + gap)
    + (distance > 0 ? growth * (1 - phase) + (distance > 1 ? growth * phase : 0) : 0)
  return { offset, size: compact + growth * focus, focus }
}

/** First slot whose trailing edge has not cleared the leading viewport edge. */
export function getExpandLoopStart({ anchor, anchorIndex, compact, gap }) {
  const step = compact + gap
  if (step <= 0) return anchorIndex
  const firstCompactSlot = Math.floor((-anchor - compact) / step) + 1
  return anchorIndex + Math.min(0, firstCompactSlot)
}

/** Wrap offscreen slots and keep the original closest to the active card. */
export function getExpandVirtualIndex(index, position, count, first, copy = 0) {
  if (count <= 0) return index
  const firstOccurrence = index + Math.ceil((first - index) / count) * count
  const nearest = index + Math.round((position - index) / count) * count
  const original = Math.max(firstOccurrence, nearest)
  if (!copy) return original
  const occurrence = firstOccurrence + (copy - 1) * count
  return occurrence < original ? occurrence : occurrence + count
}

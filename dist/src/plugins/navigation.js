import { getLastSlideIndex } from '../navigation.js'

/** Built-ins share the core policy; the fallback supports lightweight legacy contexts. */
export function navigationTarget(context, direction, fromIndex = context.getIndex()) {
  if (typeof context.getNavigationTarget === 'function') return context.getNavigationTarget(direction, fromIndex)
  const count = context.getSlideCount()
  if (count === 0) return 0
  const loop = context.isLoop()
  const step = context.getSlidesPerScroll?.() ?? 1
  const target = fromIndex + direction * (loop ? step % count : step)
  const last = context.getNavigationGeometry?.()?.lastIndex ?? getLastSlideIndex(count, context.getSlidesPerView())
  return loop ? ((target % count) + count) % count : Math.max(0, Math.min(target, last))
}

export function canNavigate(context, direction = 1) {
  return !!context && context.getSlideCount() > 1
    && navigationTarget(context, direction) !== context.getIndex()
}

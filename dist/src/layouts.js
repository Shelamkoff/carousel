import { getExpandGeometry, getExpandSlot, getExpandVirtualIndex } from './expand.js'
import { synchronous } from './synchronous.js'

export function isCarouselLayout(layout) {
  return layout === 'standard' || layout === 'expand' || !!(layout
    && typeof layout === 'object' && !Array.isArray(layout)
    && typeof layout.name === 'string' && layout.name.trim() && typeof layout.render === 'function'
    && (layout.visibleSlides === undefined || Number.isFinite(layout.visibleSlides) && layout.visibleSlides > 0))
}

/** Resolve built-in presentation choices outside the navigation coordinator. */
export function getLayoutSizing(options) {
  const slidesPerView = options.layout === 'expand' ? options.expandVisible : options.slidesPerView ?? 1
  return { slidesPerView, visibleSlides: typeof options.layout === 'object'
    ? options.layout.visibleSlides ?? slidesPerView : slidesPerView }
}

/** Layouts return geometry only; DOM ownership and the animation clock stay in core. */
export function resolveLayoutSlots(layout, context, options) {
  if (layout === 'standard') return context.slides
  if (layout === 'expand') {
    const position = context.logicalPosition ?? (context.step > 0 ? context.position / context.step : 0)
    const geometry = getExpandGeometry(position, context.viewportSize, options.slidesPerView,
      options.expandRatio, options.expandPeek, context.gap, context.count, context.loop)
    return context.slides.map(slide => {
      const virtual = context.loop
        ? getExpandVirtualIndex(slide.index, position, context.count, slide.copy) : slide.index
      return { ...getExpandSlot(geometry, virtual), progress: virtual - position }
    })
  }
  const input = Object.freeze({ ...context,
    slides: Object.freeze(context.slides.map(slide => Object.freeze({ ...slide }))),
  })
  const output = synchronous(layout.render(input), 'layout render()')
  if (!Array.isArray(output) || output.length !== input.slides.length) {
    throw new TypeError('Carousel: layout must return one geometry record per visual slide')
  }
  // Validate the entire frame before writing anything. Never leave a partially
  // applied frame after an invalid return, including NaN, Infinity or a Promise.
  return Array.from(output, (slot, index) => {
    const { offset, size, progress } = slot ?? {}
    if (!Number.isFinite(offset) || !Number.isFinite(size) || size < 0
      || progress !== undefined && !Number.isFinite(progress)) {
      throw new TypeError('Carousel: layout geometry must contain finite offsets, sizes and progress')
    }
    return { offset, size, progress: progress ?? input.slides[index].progress }
  })
}

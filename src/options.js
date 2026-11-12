import { isCarouselLayout } from './layouts.js'
import { isViewportTransition } from './transitions/ViewportTransition.js'

/** @type {import('./types').CarouselOptions} */
export const DEFAULTS = {
  slidesPerView: 1,
  orientation: 'horizontal',
  layout: 'standard',
  expandVisible: 2.5,
  expandRatio: 2.5,
  expandPeek: 32,
  slidesPerScroll: 1,
  gap: 0,
  transition: 'slide',
  transitionDuration: 400,
  loop: false,
  startIndex: 0,
  ariaLabel: 'Carousel',
}

export function validateResolvedOptions(options) {
  if (!isCarouselLayout(options.layout)) {
    throw new TypeError('Carousel: layout must be a built-in name or a definition with name and render(context)')
  }
  if (!Number.isFinite(options.expandVisible) || options.expandVisible < 1) {
    throw new RangeError('Carousel: expandVisible must be a finite number >= 1')
  }
  if (!Number.isFinite(options.expandRatio) || options.expandRatio < 1) {
    throw new RangeError('Carousel: expandRatio must be a finite number >= 1')
  }
  if (!Number.isFinite(options.expandPeek) || options.expandPeek < 0) {
    throw new RangeError('Carousel: expandPeek must be a non-negative finite number')
  }
  if (options.layout === 'expand' && options.slidesPerView !== 1) {
    throw new RangeError('Carousel: expand layout has one active slide; use expandVisible for neighboring previews')
  }
  if (options.layout !== 'standard' && options.transition === 'fade') {
    throw new TypeError('Carousel: fade requires the standard layout')
  }
  if (options.orientation !== 'horizontal' && options.orientation !== 'vertical') {
    throw new TypeError('Carousel: orientation must be "horizontal" or "vertical"')
  }
  if (options.viewportHeight !== undefined
    && (!Number.isFinite(options.viewportHeight) || options.viewportHeight <= 0)) {
    throw new RangeError('Carousel: viewportHeight must be a positive finite number')
  }
  if (!Number.isFinite(options.slidesPerView) || options.slidesPerView <= 0) {
    throw new RangeError('Carousel: slidesPerView must be a positive number')
  }
  if (options.slidesPerScroll !== 'auto'
    && (!Number.isInteger(options.slidesPerScroll) || options.slidesPerScroll <= 0)) {
    throw new RangeError('Carousel: slidesPerScroll must be a positive integer or "auto"')
  }
  if (!Number.isFinite(options.gap) || options.gap < 0) {
    throw new RangeError('Carousel: gap must be a non-negative number')
  }
  if (!Number.isFinite(options.transitionDuration) || options.transitionDuration < 0) {
    throw new RangeError('Carousel: transitionDuration must be a non-negative number')
  }
  if (options.transition !== 'slide' && options.transition !== 'fade' && !isViewportTransition(options.transition)) {
    throw new TypeError('Carousel: transition must be a built-in name or a definition with name and create(context)')
  }
  if (!Number.isInteger(options.startIndex) || options.startIndex < 0) {
    throw new RangeError('Carousel: startIndex must be a non-negative integer')
  }
  if (typeof options.loop !== 'boolean') {
    throw new TypeError('Carousel: loop must be a boolean')
  }
  if (typeof options.ariaLabel !== 'string' || !options.ariaLabel.trim()) {
    throw new TypeError('Carousel: ariaLabel must be a non-empty string')
  }
  return options
}

export function validateOptionsTree(options) {
  const resolved = { ...options }
  const breakpoints = resolved.breakpoints
  delete resolved.breakpoints
  validateResolvedOptions(resolved)
  if (!breakpoints) return
  if (typeof breakpoints !== 'object' || Array.isArray(breakpoints)) {
    throw new TypeError('Carousel: breakpoints must be an object')
  }
  const entries = Object.entries(breakpoints)
    .map(([width, override]) => [Number(width), override])
    .sort((a, b) => a[0] - b[0])
  for (const [width, override] of entries) {
    if (!Number.isFinite(width) || width < 0) throw new RangeError('Carousel: breakpoint widths must be non-negative numbers')
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new TypeError('Carousel: breakpoint overrides must be objects')
    }
    if (Object.prototype.hasOwnProperty.call(override, 'plugins')
      || Object.prototype.hasOwnProperty.call(override, 'startIndex')
      || Object.prototype.hasOwnProperty.call(override, 'breakpoints')) {
      throw new TypeError('Carousel: nested breakpoints, plugins, and startIndex overrides are not supported')
    }
    Object.assign(resolved, override)
    delete resolved.breakpoints
    validateResolvedOptions(resolved)
  }
}



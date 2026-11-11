/** Measure the overlay once in layout pixels, independently of ancestor scale. */
export function getViewportSize(container) {
  const computed = container.ownerDocument?.defaultView?.getComputedStyle(container)
  const cssWidth = Number.parseFloat(computed?.width)
  const cssHeight = Number.parseFloat(computed?.height)
  if (Number.isFinite(cssWidth) && Number.isFinite(cssHeight)) {
    return { width: Math.max(1, cssWidth), height: Math.max(1, cssHeight) }
  }
  const { width, height } = container.getBoundingClientRect()
  // Hidden/zero-sized carousels still get finite geometry. A later resize
  // settles the navigation and removes the layer through the normal lifecycle.
  return { width: Math.max(1, width), height: Math.max(1, height) }
}

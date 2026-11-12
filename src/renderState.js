/** A detached numeric snapshot: no DOM reads and no live mutable state arrays. */
export function createRenderState(slots, state) {
  const slides = slots.map(slot => {
    const visible = !slot.hidden && slot.size > 0
      ? Math.max(0, Math.min(state.viewportSize, slot.offset + slot.size) - Math.max(0, slot.offset)) / slot.size : 0
    return Object.freeze({ ...slot,
      focus: Math.max(0, 1 - Math.abs(slot.progress)),
      visible: Math.max(0, Math.min(1, visible)),
    })
  })
  return Object.freeze({ ...state, slides: Object.freeze(slides) })
}

/** Built-in layouts use the same progress values that public slide effects see. */
export function writeSlideProgress(element, progress) {
  const focus = Math.max(0, 1 - Math.abs(progress))
  const values = { '--carousel-slide-progress': progress, '--carousel-slide-focus': focus,
    '--carousel-expand-focus': focus }
  for (const [name, value] of Object.entries(values)) {
    const text = String(value)
    if (element.style.getPropertyValue?.(name) !== text) element.style.setProperty(name, text)
  }
}

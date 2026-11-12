/** Keep synchronous extension hooks inside their owner's error boundary. */
export function synchronous(value, label) {
  if (value && typeof value.then === 'function') {
    Promise.resolve(value).catch(() => {})
    throw new TypeError(`Carousel: ${label} must be synchronous`)
  }
  return value
}

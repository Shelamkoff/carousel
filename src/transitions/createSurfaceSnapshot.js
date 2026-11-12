import { createDecorativeSnapshot } from '../createDecorativeSnapshot.js'

/** A decorative DOM snapshot; it never adopts or moves application nodes. */
export function createSurfaceSnapshot(source, current = () => true) {
  const snapshot = createDecorativeSnapshot(source, current)
  if (!snapshot) return null
  const { element } = snapshot
  element.classList.remove('carousel__slide--loaded')
  element.classList.add('carousel__surface')
  element.removeAttribute('data-carousel-copy')
  element.setAttribute('aria-hidden', 'true')
  element.inert = true
  Object.assign(element.style, {
    position: 'absolute', inset: '0', width: '100%', minWidth: '0', height: '100%', minHeight: '0',
    margin: '0', flexBasis: 'auto', flexGrow: '0', flexShrink: '0', transform: 'none',
    translate: 'none', rotate: 'none', scale: 'none', transition: 'none',
    opacity: '1', visibility: 'visible', pointerEvents: 'none',
  })
  return snapshot
}

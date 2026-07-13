/**
 * Keyboard plugin — arrow key navigation.
 *
 * @param {object} [options]
 * @param {'document' | 'container'} [options.scope='document'] — event listener scope
 * @returns {import('../types').CarouselPlugin}
 */
export function createKeyboard(options = {}) {
  let ctx = null
  let handler = null
  let target = null

  const scope = options.scope ?? 'container'
  if (scope !== 'container' && scope !== 'document') {
    throw new TypeError('Carousel keyboard scope must be "container" or "document"')
  }

  return {
    name: 'keyboard',

    install(context) {
      ctx = context

      handler = /** @param {KeyboardEvent} e */ (e) => {
        // Skip editable elements
        const tag = /** @type {HTMLElement} */ (e.target).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (/** @type {HTMLElement} */ (e.target).isContentEditable) return

        // Document scope: only respond if focus is inside this carousel (or body/document)
        if (scope === 'document') {
          const focused = document.activeElement
          const root = context.getRoot()
          if (focused && focused !== document.body && root && !root.contains(focused)) return
        }

        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault()
            context.prev()
            break
          case 'ArrowRight':
            e.preventDefault()
            context.next()
            break
          case 'Home':
            e.preventDefault()
            context.goTo(0)
            break
          case 'End':
            e.preventDefault()
            context.goTo(context.getSlideCount() - 1)
            break
        }
      }

      if (scope === 'container') {
        target = context.getRoot()
        if (target) {
          target.setAttribute('tabindex', '0')
        }
      } else {
        target = document
      }

      target?.addEventListener('keydown', handler)
    },

    destroy() {
      if (target && handler) {
        target.removeEventListener('keydown', handler)
      }
      if (scope === 'container' && target?.getAttribute('tabindex') === '0') {
        target.removeAttribute('tabindex')
      }
      target = null
      handler = null
      ctx = null
    },
  }
}

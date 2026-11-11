/**
 * Keyboard plugin — arrow key navigation.
 *
 * @param {object} [options]
 * @param {'document' | 'container'} [options.scope='container'] — event listener scope
 * @returns {import('../types').CarouselPlugin}
 */
export function createKeyboard(options = {}) {
  let ctx = null
  let handler = null
  let target = null
  let ownerDocument = null

  const scope = options.scope ?? 'container'
  if (scope !== 'container' && scope !== 'document') {
    throw new TypeError('Carousel keyboard scope must be "container" or "document"')
  }

  return {
    name: 'keyboard',

    install(context) {
      ctx = context
      ownerDocument = context.getRoot()?.ownerDocument ?? globalThis.document

      handler = /** @param {KeyboardEvent} e */ (e) => {
        // Let nested widgets and browser/application shortcuts own their keys.
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
        // Shadow DOM retargets events to the component host. Inspect the
        // visible path so nested editors retain their native cursor keys.
        const root = context.getRoot()
        const path = e.composedPath?.() ?? []
        for (const node of path.length ? path : [e.target]) {
          const element = /** @type {HTMLElement} */ (node)
          const tag = element?.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element?.isContentEditable) return
          if (node === root) break
          // A nested carousel owns its keys even when its orthogonal axis
          // leaves a particular arrow key available for native page scrolling.
          if (element?.classList?.contains?.('carousel')) return
        }

        // Document scope: only respond if focus is inside this carousel (or body/document)
        if (scope === 'document') {
          const focused = ownerDocument.activeElement
          if (focused && focused !== ownerDocument.body && root && !root.contains(focused)) return
        }

        const vertical = context.options?.orientation === 'vertical'
        if (e.key === (vertical ? 'ArrowUp' : 'ArrowLeft')) {
          e.preventDefault()
          context.prev()
        } else if (e.key === (vertical ? 'ArrowDown' : 'ArrowRight')) {
          e.preventDefault()
          context.next()
        } else if (e.key === 'Home') {
          e.preventDefault()
          context.goTo(0)
        } else if (e.key === 'End') {
          e.preventDefault()
          context.goTo(context.getSlideCount() - 1)
        }
      }

      if (scope === 'container') {
        target = context.getRoot()
        if (target) {
          target.setAttribute('tabindex', '0')
        }
      } else {
        target = ownerDocument
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
      ownerDocument = null
      ctx = null
    },
  }
}

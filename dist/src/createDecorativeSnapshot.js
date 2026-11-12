import { disableCopyControl } from './dom.js'

let sequence = 0
const html = 'http://www.w3.org/1999/xhtml'
const references = new Set(['for', 'headers', 'list', 'aria-labelledby', 'aria-describedby',
  'aria-controls', 'aria-owns', 'aria-flowto', 'aria-activedescendant', 'aria-details', 'aria-errormessage'])
const embedded = new Set(['iframe', 'object', 'embed', 'script', 'fencedframe', 'portal', 'style', 'link', 'meta', 'base'])
const replaced = new Set(['iframe', 'object', 'embed', 'fencedframe', 'portal'])
const media = new Set(['video', 'audio'])

/**
 * Copy presentation without constructing another application instance.
 * Creating native elements explicitly also avoids customized built-in upgrades,
 * including elements whose `is` attribute was removed from the original.
 */
export function createDecorativeSnapshot(source, current = () => true) {
  const document = source.ownerDocument ?? globalThis.document
  const prefix = `carousel-copy-${++sequence}-`
  const ids = new Map()
  const nodes = []
  const scrolling = []

  const create = original => {
    if (original.nodeType !== 1) return original.cloneNode(false)
    const name = original.localName
    const custom = original.namespaceURI === html && name.includes('-')
    const placeholder = embedded.has(name) || custom
    const copy = placeholder ? document.createElement('span')
      : original.namespaceURI === html ? document.createElement(name)
        : document.createElementNS(original.namespaceURI, name)
    for (const { name: attribute, value, namespaceURI } of original.attributes) {
      if (/^on/i.test(attribute) || ['name', 'form', 'autofocus', 'is'].includes(attribute)) continue
      if (media.has(name) && ['src', 'autoplay', 'preload'].includes(attribute)) continue
      if (placeholder && ['src', 'srcdoc', 'data', 'type'].includes(attribute)) continue
      if (namespaceURI) copy.setAttributeNS(namespaceURI, attribute, value)
      else copy.setAttribute(attribute, value)
    }
    if (placeholder) {
      // Tag selectors no longer match a plain span. Preserve the host's computed
      // presentation and dimensions; private shadow trees/embedded pixels are
      // deliberately not recreated and no embedded document is inspected.
      const style = document.defaultView?.getComputedStyle(original)
      if (style) for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property))
      // Replaced inline elements accept width/height; ordinary inline spans do
      // not. Keep their box instead of collapsing to an empty text line.
      if (replaced.has(name) && style?.display === 'inline') copy.style.display = 'inline-block'
      copy.dataset.carouselSnapshot = custom ? 'custom-element' : 'embedded'
    }
    if (media.has(name)) copy.preload = 'none'
    if (copy.hasAttribute('contenteditable')) copy.setAttribute('contenteditable', 'false')
    disableCopyControl(copy)
    if (copy.id) {
      const previous = copy.id
      let id = `${prefix}${nodes.length}`
      while (document.getElementById(id)) id += '-copy'
      copy.id = id
      if (!ids.has(previous)) ids.set(previous, id)
    }
    nodes.push([original, copy])
    return copy
  }

  const element = create(source)
  for (let index = 0; index < nodes.length; index++) {
    if (!current()) return null
    const [original, copy] = nodes[index]
    if (embedded.has(original.localName)) continue
    for (const child of original.childNodes) {
      // Source/track nodes could load media independently even after src was
      // removed from their parent; never attach them to a decorative player.
      if (media.has(original.localName) && ['source', 'track'].includes(child.localName)) continue
      copy.appendChild(create(child))
      if (!current()) return null
    }
  }

  for (const [original, copy] of nodes) {
    if (!current()) return null
    if (copy.tagName === 'INPUT') {
      if (original.type !== 'file') copy.value = original.value
      copy.checked = original.checked
      copy.indeterminate = original.indeterminate
    } else if (copy.tagName === 'TEXTAREA') copy.value = original.value
    else if (copy.tagName === 'OPTION') copy.selected = original.selected
    else if (copy.tagName === 'SELECT') copy.selectedIndex = original.selectedIndex
    else if (copy.tagName === 'CANVAS' && original.width > 0 && original.height > 0) {
      // drawImage can copy even a tainted canvas without reading its pixels.
      try { copy.getContext('2d')?.drawImage(original, 0, 0) } catch { /* unavailable drawing buffer */ }
    } else if (copy.tagName === 'IMG' && original.currentSrc) {
      copy.src = original.currentSrc
      copy.removeAttribute('srcset')
      copy.removeAttribute('sizes')
    }
    if (original === source || original.scrollLeft || original.scrollTop) {
      scrolling.push([copy, original.scrollLeft, original.scrollTop])
    }
    for (const { name, value, namespaceURI } of [...copy.attributes]) {
      if (references.has(name)) {
        const mapped = value.trim().split(/\s+/).map(id => ids.get(id)).filter(Boolean).join(' ')
        if (mapped) copy.setAttribute(name, mapped)
        else copy.removeAttribute(name)
      } else {
        const fragment = (name === 'href' || name === 'xlink:href') && value.startsWith('#')
          ? ids.get(value.slice(1)) : null
        const rewritten = fragment ? `#${fragment}` : value.replace(/url\(\s*(['"]?)#([^'"\)\s]+)\1\s*\)/g,
          (match, quote, id) => ids.has(id) ? `url(#${ids.get(id)})` : match)
        if (rewritten !== value) {
          if (namespaceURI) copy.setAttributeNS(namespaceURI, name, rewritten)
          else copy.setAttribute(name, rewritten)
        }
      }
    }
  }
  element.setAttribute('aria-hidden', 'true')
  element.inert = true
  return {
    element,
    restoreScroll(root = element) {
      for (const [node, left, top] of scrolling) {
        const target = node === element ? root : node
        target.scrollLeft = left
        target.scrollTop = top
      }
    },
  }
}

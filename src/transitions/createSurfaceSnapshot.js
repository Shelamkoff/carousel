import { disableCopyControl } from '../dom.js'

let sequence = 0

const references = new Set(['for', 'headers', 'list', 'aria-labelledby', 'aria-describedby',
  'aria-controls', 'aria-owns', 'aria-flowto', 'aria-activedescendant', 'aria-details', 'aria-errormessage'])
const embedded = new Set(['IFRAME', 'OBJECT', 'EMBED', 'SCRIPT'])

/** A decorative DOM snapshot; it never adopts or moves application nodes. */
export function createSurfaceSnapshot(source, current = () => true) {
  const element = source.cloneNode(true)
  if (!current()) return null
  const document = source.ownerDocument
  const prefix = `carousel-surface-${++sequence}-`
  const ids = new Map()
  const pairs = [[source, element]]
  const nodes = []
  const scrolling = []
  for (let index = 0; index < pairs.length; index++) {
    if (!current()) return null
    const [original, initial] = pairs[index]
    let copy = initial
    if (embedded.has(copy.tagName)) {
      // An inert iframe can still load a document and run scripts. Preserve
      // its box without starting a second browsing context or embedded app.
      copy = document.createElement('div')
      copy.className = initial.className
      copy.style.cssText = initial.style.cssText
      copy.dataset.carouselSnapshot = 'embedded'
      for (const name of ['width', 'height']) {
        const size = Number(original.getAttribute(name))
        if (size > 0) copy.style[name] = `${size}px`
      }
      initial.replaceWith(copy)
    } else {
      const originals = [...original.children]
      const copies = [...copy.children]
      originals.forEach((child, childIndex) => {
        if (copies[childIndex]) pairs.push([child, copies[childIndex]])
      })
      if (copy.tagName === 'INPUT') {
        if (original.type !== 'file') copy.value = original.value
        copy.checked = original.checked
        copy.indeterminate = original.indeterminate
      } else if (copy.tagName === 'TEXTAREA') {
        copy.value = original.value
      } else if (copy.tagName === 'OPTION') {
        copy.selected = original.selected
      } else if (copy.tagName === 'CANVAS' && original.width > 0 && original.height > 0) {
        // cloneNode copies the element, not its drawing buffer. Drawing into
        // another canvas also works for tainted sources without reading pixels.
        try { copy.getContext('2d')?.drawImage(original, 0, 0) } catch { /* unavailable drawing buffer */ }
      } else if (copy.tagName === 'IMG' && original.currentSrc) {
        copy.src = original.currentSrc
        copy.removeAttribute('srcset')
        copy.removeAttribute('sizes')
      }
      if (copy.tagName === 'VIDEO' || copy.tagName === 'AUDIO') {
        copy.autoplay = false
        copy.removeAttribute('autoplay')
        copy.removeAttribute('src')
        copy.preload = 'none'
        for (const child of [...copy.querySelectorAll('source,track')]) child.remove()
      }
    }
    for (const attribute of [...copy.attributes]) {
      if (/^on/i.test(attribute.name)) copy.removeAttribute(attribute.name)
    }
    for (const name of ['name', 'form', 'autofocus']) copy.removeAttribute(name)
    disableCopyControl(copy)
    if (copy.hasAttribute('contenteditable')) copy.setAttribute('contenteditable', 'false')
    if (copy.id) {
      const previous = copy.id
      let id = `${prefix}${index}`
      while (document.getElementById(id)) id += '-copy'
      copy.id = id
      if (!ids.has(previous)) ids.set(previous, id)
    }
    nodes.push(copy)
    if (original.scrollLeft || original.scrollTop) scrolling.push([copy, original.scrollLeft, original.scrollTop])
  }
  // Keep local SVG paints, clip paths and references working without reusing
  // application IDs. Form/ARIA references never point back into the live tree.
  for (const node of nodes) {
    for (const { name, value } of [...node.attributes]) {
      if (references.has(name)) {
        const mapped = value.trim().split(/\s+/).map(id => ids.get(id)).filter(Boolean).join(' ')
        if (mapped) node.setAttribute(name, mapped)
        else node.removeAttribute(name)
      } else {
        const fragment = (name === 'href' || name === 'xlink:href') && value.startsWith('#')
          ? ids.get(value.slice(1)) : null
        const rewritten = fragment ? `#${fragment}` : value.replace(/url\(\s*(['"]?)#([^'"\)\s]+)\1\s*\)/g,
          (match, quote, id) => ids.has(id) ? `url(#${ids.get(id)})` : match)
        if (rewritten !== value) node.setAttribute(name, rewritten)
      }
    }
  }
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
  return {
    element,
    restoreScroll() {
      for (const [node, left, top] of scrolling) { node.scrollLeft = left; node.scrollTop = top }
    },
  }
}

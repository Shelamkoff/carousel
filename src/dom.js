/**
 * Elements can originate in another same-origin window and keep that window's
 * prototype after adoption. Validate their native DOM brand across realms.
 * @param {unknown} value
 * @returns {value is HTMLElement}
 */
export function isHTMLElement(value) {
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return true
  if (!value || value.nodeType !== 1 || value.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false
  try {
    Element.prototype.getAttribute.call(value, '')
    return true
  } catch {
    return false
  }
}

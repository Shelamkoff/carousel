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

const formControls = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FIELDSET', 'OPTION', 'OPTGROUP'])

/** Inert copies must also stay outside form submission and constraint validation. */
export function disableCopyControl(element) {
  if (formControls.has(element.tagName)) element.disabled = true
  else if (element.constructor?.formAssociated === true
    || element.tagName.includes('-') && isHTMLElement(element) && !element.matches(':defined')) {
    // A custom element may upgrade after attachment. Its disabled state must
    // already exist when a future form-associated constructor calls attachInternals.
    element.setAttribute('disabled', '')
  }
}

/** Prefer atomic DOM moves. The fallback preserves focused controls where possible. */
export function moveElement(parent, node, before = null) {
  let focused = node.ownerDocument?.activeElement
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
  const restoreFocus = focused && (node === focused || node.contains?.(focused))
  const selection = restoreFocus && typeof focused.selectionStart === 'number'
    ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection,
        value: focused.value, type: focused.type } : null
  if (typeof parent.moveBefore === 'function' && node.parentNode
    && node.ownerDocument === parent.ownerDocument && node.isConnected === parent.isConnected) {
    parent.moveBefore(node, before)
  } else {
    parent.insertBefore(node, before)
  }
  if (!restoreFocus || !focused.isConnected) return
  const root = focused.getRootNode?.() ?? focused.ownerDocument
  if (root.activeElement !== focused && focused.ownerDocument.activeElement === focused.ownerDocument.body) {
    focused.focus({ preventScroll: true })
  }
  // Even atomic reparenting can reset text selection in native form controls.
  // Do not override content or focus deliberately changed by a DOM callback.
  if (selection && root.activeElement === focused && focused.value === selection.value
    && focused.type === selection.type && (focused.selectionStart !== selection.start
      || focused.selectionEnd !== selection.end || focused.selectionDirection !== selection.direction)) {
    focused.setSelectionRange(selection.start, selection.end, selection.direction)
  }
}

// Shared ownership lets composable effects release the same property in any
// order without resurrecting the styles of an already removed effect.
const properties = new WeakMap()
const read = (element, name) => ({
  value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name),
})
const equal = (a, b) => a.value === b.value && a.priority === b.priority
function write(element, name, value) {
  if (value.value) element.style.setProperty(name, value.value, value.priority)
  else element.style.removeProperty(name)
}

export class StyleLedger {
  #owned = new Map()

  set(element, name, value) {
    let map = properties.get(element)
    if (!map) { map = new Map(); properties.set(element, map) }
    let entry = map.get(name)
    const current = read(element, name)
    if (!entry) {
      entry = { initial: current, applied: current, owners: new Map(), topOwner: null }
      map.set(name, entry)
    } else if (!equal(current, entry.applied)) {
      // Application writes made while an effect is active become the new
      // baseline. Teardown must never overwrite a newer application style.
      entry.initial = current
    }
    if (!this.#owned.has(element)) this.#owned.set(element, new Set())
    this.#owned.get(element).add(name)
    // Existing owners keep their insertion priority when rendering again.
    // Cache the last owner so every frame avoids copying the owner map.
    if (!entry.owners.has(this)) entry.topOwner = this
    entry.owners.set(this, { value: value ?? '', priority: '' })
    const last = entry.owners.get(entry.topOwner)
    if (!equal(current, last)) write(element, name, last)
    entry.applied = read(element, name)
  }

  release(element, name) {
    const owned = this.#owned.get(element)
    if (!owned?.delete(name)) return
    if (!owned.size) this.#owned.delete(element)
    const map = properties.get(element)
    const entry = map?.get(name)
    if (!entry || !entry.owners.delete(this)) return
    if (entry.topOwner === this) {
      entry.topOwner = null
      for (const owner of entry.owners.keys()) entry.topOwner = owner
    }
    const current = read(element, name)
    if (equal(current, entry.applied)) {
      const next = entry.owners.get(entry.topOwner) ?? entry.initial
      if (!equal(current, next)) write(element, name, next)
    } else {
      entry.initial = current
    }
    entry.applied = read(element, name)
    if (!entry.owners.size) map.delete(name)
    if (!map.size) properties.delete(element)
  }

  clear() {
    for (const [element, names] of [...this.#owned]) {
      for (const name of [...names]) this.release(element, name)
    }
  }
}

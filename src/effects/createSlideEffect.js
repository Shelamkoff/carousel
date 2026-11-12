import { StyleLedger } from './StyleLedger.js'

function synchronous(value, label) {
  if (value && typeof value.then === 'function') {
    Promise.resolve(value).catch(() => {})
    throw new TypeError(`Carousel: effect ${label} must be synchronous`)
  }
  return value
}

/** Adapt a visual effect to the existing plugin ownership and core frame clock. */
export function createSlideEffect(definition) {
  if (!definition || typeof definition.name !== 'string' || !definition.name.trim()
    || typeof definition.create !== 'function') {
    throw new TypeError('Carousel: a slide effect needs a name and create(context)')
  }
  let context = null
  let instance = null
  let unsubscribers = []
  let version = 0
  let renderingVersion = null
  let rendering = false
  let pending = null
  let queued = false
  const styles = new StyleLedger()

  function reset() { version++; styles.clear() }

  function destroy() {
    const retired = instance
    instance = null
    context = null
    pending = null
    queued = false
    version++
    const unsubs = unsubscribers
    unsubscribers = []
    for (const unsubscribe of unsubs) unsubscribe()
    try { synchronous(retired?.destroy?.(), 'destroy()') }
    finally { styles.clear() }
  }

  function fail(error) {
    const owner = context
    try { destroy() } catch { /* preserve the original failure */ }
    owner?.emit('effect:error', {
      name: definition.name, error: error instanceof Error ? error : new Error(String(error)),
    })
  }

  function render(state) {
    if (!context || !instance || !state) return
    // An earlier subscriber can rebuild during EventBus's snapshotted dispatch.
    // The same check also retires a queued frame superseded before its microtask.
    if (state !== context.getRenderState()) return
    if (rendering) { pending = state; return }
    const owner = context
    const active = instance
    rendering = true
    const previous = renderingVersion
    renderingVersion = version
    try { synchronous(active.render(state), 'render()') }
    catch (error) {
      // A render may uninstall and reinstall this plugin before throwing.
      // Its obsolete failure must not tear down the replacement instance.
      if (context === owner && instance === active) fail(error)
    }
    finally {
      renderingVersion = previous
      rendering = false
      if (pending && context && !queued) {
        const owner = context
        queued = true
        queueMicrotask(() => {
          if (context !== owner) return
          queued = false
          const next = pending
          pending = null
          render(next)
        })
      }
    }
  }

  return {
    name: `effect:${definition.name}`,
    install(ctx) {
      context = ctx
      const root = ctx.getRoot()
      const viewport = ctx.getViewport()
      const track = ctx.getTrack()
      const ownerVersion = ++version
      const setStyle = (element, property, value) => {
        if (!context || context !== ctx || ownerVersion > version
          || renderingVersion !== null && renderingVersion !== version || !element) return
        if (typeof property !== 'string' || !property.trim()
          || value !== null && typeof value !== 'string') {
          throw new TypeError('Carousel: effect styles require a CSS property and a string or null')
        }
        // Releasing is safe even after a target was detached: only this
        // ledger's own property can be released, never another owner's style.
        if (value === null) { styles.release(element, property); return }
        let node = element
        while (node && node !== root) {
          if (node.classList?.contains('carousel')) break
          node = node.parentNode ?? node.getRootNode?.().host
        }
        if (node !== root) throw new TypeError('Carousel: effects can only style their own slide content')
        const positioned = element === root || element === viewport || element === track
          || element.classList?.contains('carousel__slide')
        if (positioned && !property.startsWith('--')) {
          throw new TypeError('Carousel: use CSS variables or style descendants, not core positioning elements')
        }
        styles.set(element, property, value)
      }
      try {
        const created = synchronous(definition.create(Object.freeze({ root, viewport, setStyle })), 'create()')
        instance = created
        if (!created || typeof created.render !== 'function'
          || created.destroy !== undefined && typeof created.destroy !== 'function') {
          throw new TypeError('Carousel: effect create() must return render(frame) and optional destroy()')
        }
        unsubscribers = [ctx.on('render', render), ctx.on('render:reset', reset)]
        render(ctx.getRenderState())
      } catch (error) { fail(error) }
    },
    destroy,
  }
}

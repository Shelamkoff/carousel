/** Owns a plugin's event subscriptions and revocable command scope. */
export function createPluginScope(events, commands) {
  const subscriptions = new Set()
  const onSubscriptions = new Map()
  let closed = false

  // EventBus may already have snapshotted a callback when it is removed.
  // Owned callbacks stay inert after unsubscribe or context cleanup, and
  // a retired context cannot register new work after its owner is gone.
  const subscribe = (ev, fn, once = false) => {
    if (typeof fn !== 'function') throw new TypeError('Carousel: event handler must be a function')
    if (closed) return () => {}
    const existing = !once && onSubscriptions.get(ev)?.get(fn)
    if (existing) return existing

    let active = true
    const unsubscribe = () => {
      if (!active) return
      active = false
      subscriptions.delete(unsubscribe)
      if (!once) {
        const handlers = onSubscriptions.get(ev)
        handlers?.delete(fn)
        if (!handlers?.size) onSubscriptions.delete(ev)
      }
      remove()
    }
    const remove = events.on(ev, (...args) => {
      if (!active || closed) return
      // Remove before dispatch so nested emissions cannot repeat a once
      // callback or retain its subscription in a long-lived plugin.
      if (once) unsubscribe()
      return fn(...args)
    })
    subscriptions.add(unsubscribe)
    if (!once) {
      if (!onSubscriptions.has(ev)) onSubscriptions.set(ev, new Map())
      onSubscriptions.get(ev).set(fn, unsubscribe)
    }
    return unsubscribe
  }
  const context = {
    ...commands,
    on: (ev, fn) => subscribe(ev, fn),
    once: (ev, fn) => subscribe(ev, fn, true),
    emit: (ev, ...args) => events.emit(ev, ...args),
  }
  // A removed plugin may still have queued callbacks holding its old scope.
  // Revoke commands as well as subscriptions; teardown can emit until closed.
  for (const name of ['emit', 'next', 'prev', 'goTo', 'addSlide', 'removeSlide',
    'updateSlide', 'moveSlide', 'setSlides', 'refresh', 'goToAfterDrag', 'snapBack',
    'stopAnimation', 'setPosition', 'setPositionDrag', 'renderSlide', 'refreshLayout']) {
    const command = context[name]
    context[name] = (...args) => closed ? undefined : command(...args)
  }
  Object.freeze(context)
  return {
    context,
    cleanup: () => {
      closed = true
      for (const unsubscribe of [...subscriptions]) unsubscribe()
    },
  }
}

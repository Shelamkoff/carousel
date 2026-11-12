import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutoplay } from '../src/plugins/autoplay.js'
import { createControls } from '../src/plugins/controls.js'

function environment(t, configuration = {}) {
  let time = 0
  let sequence = 0
  let index = configuration.index ?? 0
  let count = configuration.count ?? 3
  let nextCalls = 0
  const timers = new Map()
  const frames = new Map()
  const plugins = new Map()
  const events = new Map()
  function target() {
    const listeners = new Map()
    return {
      listeners,
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type).add(fn)
      },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn) },
      dispatch(type, properties = {}) {
        const event = { type, target: this, ...properties }
        for (const handler of [...(listeners.get(type) ?? [])]) handler(event)
      },
    }
  }
  const view = Object.assign(target(), {
    performance: { now: () => time },
    setTimeout(callback, duration) {
      const id = ++sequence
      timers.set(id, { callback, deadline: time + duration })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
  })
  const document = Object.assign(target(), {
    defaultView: view,
    hidden: false,
    activeElement: null,
    createElement(tag) { return element(tag) },
    createElementNS(namespace, tag) { return element(tag) },
  })
  function element(tag = 'div') {
    const attrs = new Map()
    const style = new Map()
    const node = Object.assign(target(), {
      tagName: tag.toUpperCase(), ownerDocument: document,
      children: [], parentNode: null, className: '', dataset: {}, hidden: false,
      textContent: '', style: {
        setProperty(name, value) { style.set(name, value) },
        getPropertyValue(name) { return style.get(name) ?? '' },
      },
      classList: {
        contains(name) { return node.className.split(' ').includes(name) },
      },
      setAttribute(name, value) { attrs.set(name, String(value)); if (name === 'class') node.className = String(value) },
      getAttribute(name) { return attrs.get(name) ?? null },
      appendChild(child) { child.remove(); node.children.push(child); child.parentNode = node; return child },
      replaceChildren(...children) { [...node.children].forEach(child => child.remove()); children.forEach(child => node.appendChild(child)) },
      remove() {
        if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1)
        node.parentNode = null
      },
      contains(child) { return child === node || node.children.some(item => item.contains(child)) },
      closest(selector) {
        if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return node
        return node.parentNode?.closest(selector) ?? null
      },
      matches() { return false },
      click() { if (!node.disabled) node.dispatch('click') },
    })
    return node
  }
  const root = element()
  const viewport = element()
  root.appendChild(viewport)
  const context = {
    getRoot: () => root,
    getViewport: () => viewport,
    getPlugin: name => plugins.get(name),
    getIndex: () => index,
    getSlideCount: () => count,
    getSlidesPerView: () => configuration.slidesPerView ?? 1,
    getSlidesPerScroll: () => configuration.slidesPerScroll ?? 1,
    isLoop: () => configuration.loop ?? true,
    on(name, handler) {
      if (!events.has(name)) events.set(name, new Set())
      events.get(name).add(handler)
      return () => events.get(name)?.delete(handler)
    },
    emit(name, payload) { for (const handler of [...(events.get(name) ?? [])]) handler(payload) },
    next() {
      nextCalls++
      if (configuration.noop) return
      const nextIndex = (index + 1) % count
      context.emit('slide:beforeChange', { fromIndex: index, toIndex: nextIndex })
      context.emit('transition:start', { fromIndex: index, toIndex: nextIndex })
      index = nextIndex
      if (!configuration.manualTransition) finish()
    },
  }
  function finish() {
    context.emit('transition:end', { index })
    context.emit('slide:change', { index })
  }
  function install(plugin) {
    plugin.install(context)
    plugins.set(plugin.name, plugin)
    return plugin
  }
  function advance(duration) {
    const end = time + duration
    for (let attempts = 0; attempts < 1000; attempts++) {
      const due = [...timers.entries()].filter(([, timer]) => timer.deadline <= end)
        .sort((a, b) => a[1].deadline - b[1].deadline)[0]
      if (!due) { time = end; return }
      time = due[1].deadline
      timers.delete(due[0])
      due[1].callback()
    }
    throw new Error('unbounded timer loop')
  }
  function paint() {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach(callback => callback(time))
  }
  function byClass(name, node = root) {
    if (node.classList.contains(name)) return node
    for (const child of node.children) { const found = byClass(name, child); if (found) return found }
    return null
  }
  t.after(() => { for (const plugin of [...plugins.values()].reverse()) plugin.destroy() })
  return {
    root, viewport, view, document, context, timers, frames, install, advance, paint, byClass, finish,
    get index() { return index }, get nextCalls() { return nextCalls },
    setIndex(value) { index = value }, setCount(value) { count = value },
  }
}

test('autoplay shares an exact deadline with progress, preserves stop/start and hover time', t => {
  const env = environment(t)
  const autoplay = env.install(createAutoplay({ interval: 1000 }))
  env.advance(250)
  assert.equal(autoplay.getState().remaining, 750)
  assert.equal(autoplay.getState().progress, 0.25)
  env.root.dispatch('mouseenter')
  env.advance(5000)
  assert.equal(env.nextCalls, 0)
  assert.equal(autoplay.getState().remaining, 750)
  assert.equal(autoplay.getState().paused, true)
  env.root.dispatch('mouseleave')
  env.advance(250)
  autoplay.stop()
  env.advance(5000)
  assert.equal(autoplay.getState().remaining, 500)
  autoplay.start()
  env.advance(499)
  assert.equal(env.nextCalls, 0)
  env.advance(1)
  assert.equal(env.nextCalls, 1)
  assert.equal(autoplay.getState().remaining, 1000)
})

test('countdown waits for transition completion and ignores pure geometry resizes', t => {
  const env = environment(t, { manualTransition: true })
  const autoplay = env.install(createAutoplay({ interval: 1000, pauseOnInteraction: false }))
  env.advance(250)
  env.context.emit('resize')
  assert.equal(autoplay.getState().remaining, 750)
  env.advance(750)
  assert.equal(env.nextCalls, 1)
  assert.equal(autoplay.getState().running, false)
  env.advance(2000)
  assert.equal(env.nextCalls, 1)
  env.finish()
  env.advance(999)
  assert.equal(env.nextCalls, 1)
  env.advance(1)
  assert.equal(env.nextCalls, 2)
})

test('pointer release preserves the suspension of a navigation that was not cancelled', async t => {
  const env = environment(t, { manualTransition: true })
  let phase = 'idle'
  env.context.getRenderState = () => ({ phase })
  const autoplay = env.install(createAutoplay({ interval: 1000, pauseOnInteraction: false }))
  env.advance(1000)
  phase = 'animation'
  env.viewport.dispatch('pointerdown', { pointerId: 1 })
  env.view.dispatch('pointerup', { pointerId: 1 })
  await Promise.resolve()

  assert.equal(autoplay.getState().running, false)
  env.advance(500)
  assert.equal(autoplay.getState().remaining, 1000)
  assert.equal(env.nextCalls, 1)
  phase = 'idle'
  env.finish()
  assert.equal(autoplay.getState().running, true)
  assert.equal(autoplay.getState().remaining, 1000)
})

for (const swipeFirst of [false, true]) {
  test(`pointer release waits for snapback after ${swipeFirst ? 'earlier' : 'later'} swipe handlers`, async t => {
    const env = environment(t, { manualTransition: true })
    let phase = 'idle'
    env.context.getRenderState = () => ({ phase })
    const installSwipe = () => {
      env.viewport.addEventListener('pointerdown', () => { phase = 'idle' })
      env.view.addEventListener('pointerup', () => { phase = 'animation' })
    }
    if (swipeFirst) installSwipe()
    const autoplay = env.install(createAutoplay({ interval: 1000, pauseOnInteraction: false }))
    if (!swipeFirst) installSwipe()
    env.advance(1000)
    phase = 'animation'
    env.viewport.dispatch('pointerdown', { pointerId: 1 })
    env.view.dispatch('pointerup', { pointerId: 1 })
    await Promise.resolve()

    assert.equal(autoplay.getState().running, false)
    env.advance(500)
    assert.equal(autoplay.getState().remaining, 1000)
    // Snapback has no transition:end: the shared idle frame settles it.
    phase = 'idle'
    env.context.emit('render', { phase })
    assert.equal(autoplay.getState().running, true)
    env.advance(999)
    assert.equal(env.nextCalls, 1)
    env.advance(1)
    assert.equal(env.nextCalls, 2)

    env.viewport.dispatch('pointerdown', { pointerId: 2 })
    env.view.dispatch('pointerup', { pointerId: 2 })
    await Promise.resolve()
    autoplay.destroy()
    phase = 'idle'
    env.context.emit('render', { phase })
    assert.equal(env.timers.size, 0, 'removed autoplay must retire its temporary render subscription')
  })
}

for (const completion of ['transition:end', 'render']) {
  test(`installing autoplay during motion waits for ${completion}`, t => {
    const env = environment(t, { manualTransition: true })
    let phase = 'animation'
    env.context.getRenderState = () => ({ phase })
    const autoplay = env.install(createAutoplay({ interval: 1000 }))
    assert.equal(autoplay.isActive(), true)
    assert.equal(autoplay.getState().paused, true)
    assert.equal(autoplay.getState().running, false)
    env.advance(500)
    assert.equal(autoplay.getState().remaining, 1000)
    assert.equal(env.nextCalls, 0)

    phase = 'idle'
    env.context.emit(completion, completion === 'render' ? { phase } : { index: 0 })
    assert.equal(autoplay.getState().running, true)
    env.advance(999)
    assert.equal(env.nextCalls, 0)
    env.advance(1)
    assert.equal(env.nextCalls, 1)
  })
}

test('visibility, focus and overlapping pointer suspensions preserve a single timer', t => {
  const env = environment(t)
  const autoplay = env.install(createAutoplay({ interval: 1000, pauseOnInteraction: false }))
  env.advance(250)
  env.viewport.dispatch('pointerdown', { pointerId: 1 })
  env.viewport.dispatch('pointerdown', { pointerId: 2 })
  env.document.hidden = true
  env.document.dispatch('visibilitychange')
  env.view.dispatch('pointerup', { pointerId: 1 })
  env.view.dispatch('pointerup', { pointerId: 2 })
  assert.equal(env.timers.size, 0)
  autoplay.start()
  assert.equal(env.timers.size, 0, 'explicit Play cannot override a hidden document')
  env.document.hidden = false
  env.document.dispatch('visibilitychange')
  assert.equal(env.timers.size, 1)
  env.root.dispatch('focusin')
  env.advance(4000)
  assert.equal(autoplay.getState().remaining, 750)
  autoplay.start()
  assert.equal(env.timers.size, 1, 'explicit Play works while its control is focused')
  env.root.dispatch('focusin')
  assert.equal(env.timers.size, 0, 'moving focus to another control suspends again')
  env.root.dispatch('focusout', { relatedTarget: null })
  env.advance(750)
  assert.equal(env.nextCalls, 1)
})

test('manual navigation resets the interval and honors pauseOnInteraction', t => {
  const env = environment(t)
  const autoplay = env.install(createAutoplay({ interval: 1000 }))
  env.advance(400)
  env.context.next()
  assert.equal(autoplay.isActive(), false)
  assert.equal(autoplay.getState().remaining, 1000)
  autoplay.start()
  env.advance(999)
  assert.equal(env.nextCalls, 1)
  env.advance(1)
  assert.equal(env.nextCalls, 2)
})

test('finite completion and non-navigable loops cannot recurse through restart listeners', t => {
  const env = environment(t, { loop: false })
  const autoplay = createAutoplay({ interval: 1000 })
  let stops = 0
  env.context.on('autoplay:stop', () => { stops++; autoplay.start() })
  env.install(autoplay)
  env.advance(2000)
  assert.equal(stops, 1)
  assert.equal(env.index, 2)
  assert.equal(autoplay.isActive(), false)
  assert.equal(env.timers.size, 0)
  autoplay.start()
  assert.equal(stops, 1)
  env.setCount(0)
  env.context.emit('resize')
  autoplay.start()
  assert.equal(env.timers.size, 0)
  const other = environment(t, { count: 3, slidesPerScroll: 3 })
  const noMovement = other.install(createAutoplay())
  assert.equal(noMovement.isActive(), false)
  assert.equal(other.timers.size, 0)
})

test('no-op navigation retries safely, teardown retires timer and all DOM listeners', t => {
  const env = environment(t, { noop: true })
  const autoplay = env.install(createAutoplay({ interval: 100 }))
  env.advance(350)
  assert.equal(env.nextCalls, 3)
  assert.equal(env.timers.size, 1)
  const stale = [...env.timers.values()][0].callback
  autoplay.destroy()
  stale()
  assert.equal(env.nextCalls, 3)
  assert.equal(env.timers.size, 0)
  for (const target of [env.root, env.viewport, env.document, env.view]) {
    assert.equal([...target.listeners.values()].reduce((count, handlers) => count + handlers.size, 0), 0)
  }
  assert.equal(autoplay.getState().available, false)
})

for (const order of ['controls-first', 'autoplay-first']) {
  test(`controls support ${order}, native options updates and an independent counter`, t => {
    const env = environment(t)
    const controls = createControls()
    const autoplay = createAutoplay({ interval: 1000 })
    for (const plugin of order === 'controls-first' ? [controls, autoplay] : [autoplay, controls]) env.install(plugin)
    const button = env.byClass('carousel__play-pause')
    const progress = env.byClass('carousel__autoplay-progress')
    const counter = env.byClass('carousel__counter')
    assert.equal(button.hidden, false)
    assert.equal(button.getAttribute('aria-label'), 'Pause autoplay')
    assert.equal(counter.textContent, '1 / 3')
    env.advance(250)
    env.paint()
    assert.equal(progress.getAttribute('aria-valuenow'), '25')
    assert.equal(env.frames.size, 1)
    button.click()
    assert.equal(autoplay.isActive(), false)
    assert.equal(env.frames.size, 0)
    env.advance(5000)
    assert.equal(progress.getAttribute('aria-valuenow'), '25')
    button.click()
    env.advance(750)
    assert.equal(counter.textContent, '2 / 3')
    controls.update({ progress: false, playPause: false, labels: { counter: 'Слайд' } })
    assert.equal(env.frames.size, 0)
    assert.equal(button.hidden, true)
    assert.equal(progress.hidden, true)
    assert.equal(counter.hidden, false)
    assert.equal(counter.getAttribute('aria-label'), 'Слайд 2 / 3')
    controls.update({ progress: 'bar', playPause: true, counter: false, position: 'overlay' })
    assert.equal(env.byClass('carousel__controls').parentNode, env.viewport)
    assert.ok(env.byClass('carousel__autoplay-progress--bar'))
    assert.equal(counter.hidden, true)
    assert.equal(button.hidden, false)
    assert.equal(env.frames.size, 1)
    controls.update({ counter: false, playPause: false, progress: false })
    assert.equal(env.byClass('carousel__controls').hidden, true)
    autoplay.destroy()
    controls.update({ counter: true, playPause: true, progress: 'circle' })
    assert.equal(button.hidden, true)
    assert.equal(progress.hidden, true)
    assert.equal(counter.hidden, false)
  })
}

test('overlay controls do not stop autoplay on pointerdown before toggle', t => {
  const env = environment(t)
  const autoplay = env.install(createAutoplay({ interval: 1000 }))
  env.install(createControls({ position: 'overlay' }))
  const button = env.byClass('carousel__play-pause')
  const controls = env.byClass('carousel__controls')
  for (const expected of [false, true, false]) {
    env.viewport.dispatch('pointerdown', { pointerId: 1, target: button, composedPath: () => [button, controls, env.viewport, env.root] })
    button.click()
    assert.equal(autoplay.isActive(), expected)
  }
})

test('counter tracks source slides including empty mutation and safely formats plain text', t => {
  const env = environment(t, { count: 0 })
  const controls = env.install(createControls({ formatCounter: (current, total) => `<b>${current}/${total}</b>` }))
  const counter = env.byClass('carousel__counter')
  assert.equal(counter.textContent, '<b>0/0</b>')
  assert.equal(counter.children.length, 0)
  assert.equal(env.byClass('carousel__play-pause').hidden, true)
  assert.equal(env.byClass('carousel__autoplay-progress').hidden, true)
  env.setCount(7)
  env.setIndex(6)
  env.context.emit('resize')
  assert.equal(counter.textContent, '<b>7/7</b>')
  controls.update({ formatCounter() { throw new Error('consumer formatter') } })
  assert.equal(counter.textContent, '7 / 7')
  assert.throws(() => controls.update({ progress: 'unknown' }), /progress/)
  assert.equal(counter.textContent, '7 / 7', 'invalid updates leave the previous presentation usable')
})

test('controls cleanup cancels frames and retained controls stay inert after reuse', t => {
  const env = environment(t)
  env.install(createAutoplay({ interval: 1000 }))
  const controls = env.install(createControls())
  const retained = env.byClass('carousel__play-pause')
  const stale = [...env.frames.values()][0]
  controls.destroy()
  stale()
  assert.equal(env.frames.size, 0)
  assert.equal(env.byClass('carousel__controls'), null)
  const other = environment(t)
  const autoplay = other.install(createAutoplay())
  other.install(controls)
  retained.click()
  assert.equal(autoplay.isActive(), true)
  assert.equal(other.frames.size, 1)
})

test('a progress-disabled controls plugin adds no animation loop', t => {
  const env = environment(t)
  env.install(createAutoplay())
  env.install(createControls({ progress: false }))
  assert.equal(env.frames.size, 0)
  env.advance(1000)
  assert.equal(env.frames.size, 0)
  assert.equal(env.timers.size, 1)
})

test('autoplay rejects delays that native timers would overflow into a rapid loop', t => {
  for (const interval of [0, -1, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createAutoplay({ interval }), RangeError)
  }
  const env = environment(t)
  const autoplay = env.install(createAutoplay({ interval: 2147483647 }))
  env.advance(1000)
  assert.equal(env.nextCalls, 0)
  assert.equal(autoplay.getState().remaining, 2147482647)
})

test('reentrant autoplay state listeners cannot leave an obsolete Play/Pause presentation', async t => {
  for (const duringInstall of [false, true]) {
    const env = environment(t)
    const autoplay = createAutoplay({ interval: 1000 })
    let armed = duringInstall
    env.context.on('autoplay:state', snapshot => {
      if (armed && snapshot.active) {
        armed = false
        autoplay.stop()
      }
    })
    env.install(createControls())
    env.install(autoplay)
    if (!duringInstall) {
      autoplay.stop()
      armed = true
      autoplay.start()
    }
    await Promise.resolve()
    assert.equal(autoplay.isActive(), false)
    assert.equal(env.byClass('carousel__play-pause').getAttribute('aria-label'), 'Play autoplay')
    assert.equal(env.frames.size, 0)
  }
})

test('optional undefined labels preserve defaults and previous translations', t => {
  const env = environment(t)
  env.install(createAutoplay())
  const controls = env.install(createControls({ labels: { play: undefined, pause: 'Пауза' } }))
  assert.equal(env.byClass('carousel__play-pause').getAttribute('aria-label'), 'Пауза')
  controls.update({ labels: { pause: undefined } })
  assert.equal(env.byClass('carousel__play-pause').getAttribute('aria-label'), 'Пауза')
  env.byClass('carousel__play-pause').click()
  assert.equal(env.byClass('carousel__play-pause').getAttribute('aria-label'), 'Play autoplay')
})

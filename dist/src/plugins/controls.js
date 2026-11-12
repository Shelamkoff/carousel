import { canNavigate } from './navigation.js'

const DEFAULT_LABELS = {
  play: 'Play autoplay',
  pause: 'Pause autoplay',
  progress: 'Time elapsed on this slide',
  counter: 'Slide',
  controls: 'Carousel controls',
}
const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
}

function resolveOptions(input, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Carousel controls options must be an object')
  }
  if (input.labels !== undefined && (!input.labels || typeof input.labels !== 'object' || Array.isArray(input.labels))) {
    throw new TypeError('Carousel controls labels must be an object')
  }
  const merged = { ...previous, ...input }
  const settings = {
    playPause: merged.playPause ?? true,
    progress: merged.progress ?? 'circle',
    counter: merged.counter ?? true,
    position: merged.position ?? 'below',
    labels: { ...DEFAULT_LABELS, ...previous.labels },
    formatCounter: merged.formatCounter,
  }
  for (const [name, value] of Object.entries(input.labels ?? {})) {
    if (value !== undefined) settings.labels[name] = value
  }
  if (typeof settings.playPause !== 'boolean' || typeof settings.counter !== 'boolean') {
    throw new TypeError('Carousel controls visibility options must be booleans')
  }
  if (![false, 'circle', 'bar'].includes(settings.progress)) {
    throw new TypeError('Carousel controls progress must be false, "circle", or "bar"')
  }
  if (!['below', 'overlay'].includes(settings.position)) {
    throw new TypeError('Carousel controls position must be "below" or "overlay"')
  }
  for (const label of Object.values(settings.labels)) {
    if (typeof label !== 'string' || !label.trim()) {
      throw new TypeError('Carousel controls labels must be non-empty strings')
    }
  }
  if (settings.formatCounter !== undefined && typeof settings.formatCounter !== 'function') {
    throw new TypeError('Carousel controls formatCounter must be a function')
  }
  return settings
}

/**
 * Optional controls work with either plugin installation order. Only the
 * progress presentation uses requestAnimationFrame; autoplay owns all timing.
 * @param {import('./controls').ControlsOptions} [options]
 * @returns {import('./controls').ControlsPlugin}
 */
export function createControls(options = {}) {
  let settings = resolveOptions(options)
  let ctx = null
  let unsubs = []
  let container = null
  let button = null
  let iconPath = null
  let progress = null
  let progressValue = null
  let progressKind = null
  let counter = null
  let frame = null
  let frameVersion = 0
  let eventWindow = null
  let state = null
  let revision = 0
  let previousPercent = null
  let onClick = null
  let reconcileQueued = false

  const player = () => {
    const candidate = ctx?.getPlugin?.('autoplay')
    return candidate && typeof candidate.getState === 'function' && typeof candidate.toggle === 'function'
      ? candidate : null
  }

  function onAutoplayState(snapshot) {
    // An earlier application listener may synchronously stop/start autoplay
    // while an older event is still being delivered. Prefer the live owner.
    const current = player()?.getState()
    render(current ?? snapshot)
    if (current || !ctx || reconcileQueued) return
    // During install(), Carousel registers the plugin after its initial
    // notification. Reconcile once after registration, before browser paint.
    const owner = ctx
    reconcileQueued = true
    queueMicrotask(() => {
      if (ctx !== owner) return
      reconcileQueued = false
      render(player()?.getState() ?? null)
    })
  }

  function cancelFrame() {
    ++frameVersion
    if (frame !== null) {
      const cancel = eventWindow?.cancelAnimationFrame?.bind(eventWindow) ?? globalThis.cancelAnimationFrame
      cancel?.(frame)
    }
    frame = null
  }

  function writeProgress(snapshot) {
    if (!progress || !snapshot) return
    const value = Math.max(0, Math.min(1, snapshot.progress))
    progress.style.setProperty('--carousel-autoplay-progress', String(value))
    if (progressKind === 'circle' && progressValue) {
      progressValue.style.strokeDashoffset = String((1 - value) * 100)
    }
    const percent = Math.round(value * 100)
    if (percent !== previousPercent) {
      progress.setAttribute('aria-valuenow', String(percent))
      previousPercent = percent
    }
  }

  function syncFrame() {
    if (!ctx || !settings.progress || !state?.available || !state.running) {
      cancelFrame()
      return
    }
    if (frame !== null) return
    const request = eventWindow?.requestAnimationFrame?.bind(eventWindow) ?? globalThis.requestAnimationFrame
    if (!request) return
    const owner = ctx
    const version = frameVersion
    frame = request(() => {
      if (ctx !== owner || version !== frameVersion) return
      frame = null
      const current = player()?.getState()
      if (current) state = current
      writeProgress(state)
      syncFrame()
    })
  }

  function canPlay() {
    return canNavigate(ctx)
  }

  function renderCounter() {
    if (!ctx || !counter) return
    const owner = ctx
    const version = revision
    const total = ctx.getSlideCount()
    const current = total === 0 ? 0 : Math.min(total, ctx.getIndex() + 1)
    const fallback = `${current} / ${total}`
    let text = fallback
    if (settings.formatCounter) {
      try {
        const formatted = settings.formatCounter(current, total)
        if (typeof formatted === 'string') text = formatted
      } catch { /* A display formatter must not interrupt navigation. */ }
    }
    if (ctx !== owner || version !== revision) return
    counter.textContent = text
    counter.setAttribute('aria-label', `${settings.labels.counter} ${fallback}`)
  }

  function render(snapshot = player()?.getState() ?? state) {
    if (!container || !ctx) return
    state = snapshot
    const version = revision
    const available = state?.available === true
    const playing = state?.active === true
    button.hidden = !settings.playPause || !available
    button.disabled = !playing && !canPlay()
    button.dataset.state = playing ? 'playing' : 'paused'
    button.setAttribute('aria-label', playing ? settings.labels.pause : settings.labels.play)
    iconPath.setAttribute('d', playing ? ICONS.pause : ICONS.play)
    progress.hidden = !settings.progress || !available
    counter.hidden = !settings.counter
    container.hidden = button.hidden && progress.hidden && counter.hidden
    renderCounter()
    if (!ctx || version !== revision) return
    writeProgress(state)
    syncFrame()
  }

  function svgElement(document, name, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name)
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
    return element
  }

  function configure() {
    if (!container || !ctx) return
    const document = container.ownerDocument
    container.className = 'carousel__controls' + (settings.position === 'overlay' ? ' carousel__controls--overlay' : '')
    container.setAttribute('aria-label', settings.labels.controls)
    const parent = settings.position === 'overlay' ? ctx.getViewport() : ctx.getRoot()
    if (parent && container.parentNode !== parent) parent.appendChild(container)
    progress.setAttribute('aria-label', settings.labels.progress)
    if (settings.progress && progressKind !== settings.progress) {
      progressKind = settings.progress
      progress.className = `carousel__autoplay-progress carousel__autoplay-progress--${progressKind}`
      progress.replaceChildren()
      if (progressKind === 'circle') {
        const svg = svgElement(document, 'svg', { viewBox: '0 0 36 36', 'aria-hidden': 'true', focusable: 'false', class: 'carousel__progress-ring' })
        const attributes = { cx: 18, cy: 18, r: 15, pathLength: 100, fill: 'none' }
        const track = svgElement(document, 'circle', { ...attributes, class: 'carousel__progress-track' })
        progressValue = svgElement(document, 'circle', { ...attributes, class: 'carousel__progress-value' })
        progressValue.setAttribute('stroke-dasharray', '100')
        svg.appendChild(track)
        svg.appendChild(progressValue)
        progress.appendChild(svg)
      } else {
        progressValue = document.createElement('span')
        progressValue.className = 'carousel__progress-value'
        progressValue.setAttribute('aria-hidden', 'true')
        progress.appendChild(progressValue)
      }
    }
    render()
  }

  return {
    name: 'controls',

    install(context) {
      ++revision
      ctx = context
      const root = context.getRoot()
      if (!root) return
      const document = root.ownerDocument ?? globalThis.document
      eventWindow = document.defaultView ?? globalThis.window ?? null
      container = document.createElement('div')
      container.setAttribute('role', 'group')
      button = document.createElement('button')
      button.className = 'carousel__play-pause'
      button.type = 'button'
      const icon = svgElement(document, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'carousel__play-pause-icon' })
      iconPath = svgElement(document, 'path')
      icon.appendChild(iconPath)
      button.appendChild(icon)
      onClick = () => { if (ctx === context) player()?.toggle() }
      button.addEventListener('click', onClick)
      progress = document.createElement('span')
      progress.className = 'carousel__autoplay-progress'
      progress.setAttribute('role', 'progressbar')
      progress.setAttribute('aria-valuemin', '0')
      progress.setAttribute('aria-valuemax', '100')
      progress.setAttribute('aria-valuenow', '0')
      counter = document.createElement('span')
      counter.className = 'carousel__counter'
      container.appendChild(button)
      container.appendChild(progress)
      container.appendChild(counter)
      unsubs.push(
        context.on('autoplay:state', onAutoplayState),
        context.on('slide:change', () => render()),
        context.on('resize', () => render()),
      )
      configure()
    },

    update(nextOptions) {
      const next = resolveOptions(nextOptions, settings)
      ++revision
      settings = next
      configure()
    },

    destroy() {
      ++revision
      cancelFrame()
      unsubs.forEach(remove => remove())
      unsubs = []
      if (button && onClick) button.removeEventListener('click', onClick)
      container?.remove()
      container = button = iconPath = progress = progressValue = counter = null
      progressKind = null
      previousPercent = null
      onClick = null
      state = null
      reconcileQueued = false
      ctx = null
      eventWindow = null
    },
  }
}

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__surface_owner__', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><style>
      .viewport { position:relative; width:400px; height:220px; overflow:hidden }
      .track { position:relative }
      .slide { width:400px; height:220px }
    </style>`,
  }))
  await page.goto('/__surface_owner__')
})

test('surface snapshots preserve live native state without moving originals or joining forms', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
    document.body.innerHTML += `<form><div class="viewport"><div class="track">
      <div class="slide"><label for="field">Field</label><input id="field" name="field" value="initial">
        <input type="checkbox" name="flag" checked><textarea name="note">initial</textarea>
        <select name="choice" multiple><option value="a" selected>A</option><option value="b">B</option></select>
        <canvas width="2" height="2"></canvas>
        <svg width="20" height="20"><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><rect width="20" height="20" fill="url(#paint)"/></svg>
      </div><div class="slide">Destination</div></div></div></form>`
    const viewport = document.querySelector('.viewport')
    const track = document.querySelector('.track')
    const [from, to] = track.children
    from.querySelector('input').value = 'typed value'
    const checkbox = from.querySelector('[type=checkbox]')
    checkbox.checked = false
    checkbox.indeterminate = true
    from.querySelector('textarea').value = 'typed note'
    const select = from.querySelector('select')
    select.options[0].selected = false
    select.options[1].selected = true
    const canvas = from.querySelector('canvas')
    canvas.getContext('2d').fillStyle = 'rgb(12, 34, 56)'
    canvas.getContext('2d').fillRect(0, 0, 2, 2)
    track.style.setProperty('visibility', 'visible', 'important')
    track.style.setProperty('opacity', '.7', 'important')
    track.style.setProperty('pointer-events', 'auto', 'important')
    let context
    const owner = new SurfaceTransition(viewport, { kind: 'surfaces', name: 'native', createSurfaces(value) {
      context = value
      return { render() {} }
    } }, { fromElement: from, toElement: to, trackElement: track,
      fromIndex: 0, toIndex: 1, direction: 1, orientation: 'horizontal', viewportSize: 400 })
    try {
      owner.initialize()
      const snapshotInput = context.from.querySelector('input')
      const snapshotCheck = context.from.querySelector('[type=checkbox]')
      const snapshotPaint = context.from.querySelector('linearGradient').id
      const active = {
        originals: track.children[0] === from && track.children[1] === to,
        snapshots: context.from !== from && context.to !== to,
        value: snapshotInput.value,
        checked: snapshotCheck.checked,
        indeterminate: snapshotCheck.indeterminate,
        note: context.from.querySelector('textarea').value,
        selection: [...context.from.querySelector('select').selectedOptions].map(option => option.value),
        pixel: [...context.from.querySelector('canvas').getContext('2d').getImageData(0, 0, 1, 1).data],
        inert: context.container.inert && context.from.inert && context.to.inert,
        disabled: [...context.from.querySelectorAll('input,textarea,select,option')].every(node => node.disabled),
        form: [...new FormData(document.querySelector('form'))],
        idCount: document.querySelectorAll('#field').length,
        namespacedLabel: context.from.querySelector('label').htmlFor === snapshotInput.id && snapshotInput.id !== 'field',
        namespacedPaint: context.from.querySelector('rect').getAttribute('fill') === `url(#${snapshotPaint})` && snapshotPaint !== 'paint',
        maskedTrack: [track.style.opacity, track.style.pointerEvents, track.style.visibility],
        frozenContext: Object.isFrozen(context),
        commitAt: owner.commitAt,
      }
      owner.destroy()
      return { active, restored: ['opacity', 'pointer-events', 'visibility'].map(name =>
        [track.style.getPropertyValue(name), track.style.getPropertyPriority(name)]),
        overlays: viewport.querySelectorAll('.carousel__transition').length }
    } finally { owner.destroy() }
  })
  expect(result.active).toEqual({ originals: true, snapshots: true, value: 'typed value', checked: false,
    indeterminate: true, note: 'typed note', selection: ['b'], pixel: [12, 34, 56, 255], inert: true,
    disabled: true, form: [['field', 'typed value'], ['note', 'typed note'], ['choice', 'b']], idCount: 1,
    namespacedLabel: true, namespacedPaint: true, maskedTrack: ['0', 'none', 'visible'], frozenContext: true, commitAt: 1 })
  expect(result.restored).toEqual([['0.7', 'important'], ['auto', 'important'], ['visible', 'important']])
  expect(result.overlays).toBe(0)
})

test('reentrant creation disposes late resources once and preserves newer application styles', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
    document.body.innerHTML += '<div class="viewport"><div class="track"><div class="slide">A</div><div class="slide">B</div></div></div>'
    const viewport = document.querySelector('.viewport')
    const track = document.querySelector('.track')
    let disposed = 0
    let renders = 0
    let owner
    owner = new SurfaceTransition(viewport, { kind: 'surfaces', name: 'reentrant', createSurfaces() {
      track.style.setProperty('opacity', '.35', 'important')
      track.style.setProperty('pointer-events', 'auto', 'important')
      owner.destroy()
      return { render() { renders++ }, destroy() { disposed++ } }
    } }, { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
      fromIndex: 0, toIndex: 1, direction: 1, orientation: 'horizontal', viewportSize: 400 })
    owner.initialize()
    owner.render(.5)
    owner.destroy()
    return { disposed, renders, overlays: viewport.querySelectorAll('.carousel__transition').length,
      style: ['opacity', 'pointer-events'].map(name =>
        [track.style.getPropertyValue(name), track.style.getPropertyPriority(name)]) }
  })
  expect(result).toEqual({ disposed: 1, renders: 0, overlays: 0, style: [['0.35', 'important'], ['auto', 'important']] })
})

test('surface copies of form-associated custom controls cannot invalidate the original form', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
    customElements.define('surface-custom-field', class extends HTMLElement {
      static formAssociated = true
      constructor() {
        super()
        this.internals = this.attachInternals()
        this.internals.setValidity({ valueMissing: true }, 'Required')
      }
    })
    customElements.define('surface-custom-decoration', class extends HTMLElement {})
    document.body.innerHTML += '<form><div class="viewport"><div class="track"><div class="slide"><surface-custom-field name="custom"></surface-custom-field><surface-custom-decoration></surface-custom-decoration></div><div class="slide">B</div></div></div></form>'
    const form = document.querySelector('form')
    const viewport = form.querySelector('.viewport')
    const track = form.querySelector('.track')
    const original = track.querySelector('surface-custom-field')
    original.internals.setFormValue('valid original')
    original.internals.setValidity({})
    let context
    const owner = new SurfaceTransition(viewport, { kind: 'surfaces', name: 'form-associated', createSurfaces(value) {
      context = value
      return { render() {} }
    } }, { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
      fromIndex: 0, toIndex: 1, direction: 1, orientation: 'horizontal', viewportSize: 400 })
    try {
      owner.initialize()
      return { originalWillValidate: original.internals.willValidate,
        copyWillValidate: context.from.querySelector('surface-custom-field').internals.willValidate,
        formValid: form.checkValidity(), values: [...new FormData(form)],
        decorationDisabled: context.from.querySelector('surface-custom-decoration').hasAttribute('disabled') }
    } finally { owner.destroy() }
  })
  expect(result).toEqual({ originalWillValidate: true, copyWillValidate: false, formValid: true,
    values: [['custom', 'valid original']], decorationDisabled: false })
})

test('snapshot connection can cancel its owner before the factory runs', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
    let owner
    let snapshotsConnected = 0
    let created = 0
    customElements.define('surface-connection', class extends HTMLElement {
      connectedCallback() {
        if (this.closest('.carousel__transition')) { snapshotsConnected++; owner.destroy() }
      }
    })
    document.body.innerHTML += '<div class="viewport"><div class="track"><div class="slide"><surface-connection>A</surface-connection></div><div class="slide">B</div></div></div>'
    const viewport = document.querySelector('.viewport')
    const track = document.querySelector('.track')
    const original = track.firstElementChild.firstElementChild
    owner = new SurfaceTransition(viewport, { kind: 'surfaces', name: 'connection', createSurfaces() {
      created++
      return { render() {} }
    } }, { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
      fromIndex: 0, toIndex: 1, direction: -1, orientation: 'vertical', viewportSize: 220 })
    owner.initialize()
    owner.destroy()
    return { created, snapshotsConnected, originalRetained: track.contains(original),
      overlays: viewport.querySelectorAll('.carousel__transition').length, visibility: track.style.visibility }
  })
  expect(result).toEqual({ created: 0, snapshotsConnected: 1, originalRetained: true, overlays: 0, visibility: '' })
})

for (const method of ['createSurfaces', 'render', 'destroy']) {
  test(`surface ${method} rejects asynchronous hooks without leaking owned resources`, async ({ page }) => {
    const result = await page.evaluate(async method => {
      const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
      document.body.innerHTML += '<div class="viewport"><div class="track"><div class="slide">A</div><div class="slide">B</div></div></div>'
      const viewport = document.querySelector('.viewport')
      const track = document.querySelector('.track')
      track.style.visibility = 'visible'
      const errors = []
      const unhandled = []
      const onUnhandled = event => { unhandled.push(event.reason.message); event.preventDefault() }
      window.addEventListener('unhandledrejection', onUnhandled)
      let disposed = 0
      const reject = () => Promise.reject(new Error(`async ${method}`))
      const owner = new SurfaceTransition(viewport, { kind: 'surfaces', name: `async-${method}`, createSurfaces() {
        if (method === 'createSurfaces') return reject()
        return {
          render() { if (method === 'render') return reject() },
          destroy() { disposed++; if (method === 'destroy') return reject() },
        }
      } }, { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
        fromIndex: 0, toIndex: 1, direction: 1, orientation: 'horizontal', viewportSize: 400 })
      try {
        try { owner.initialize() } catch (error) { errors.push(error.message) }
        try { owner.destroy() } catch (error) { errors.push(error.message) }
        owner.destroy()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return { errors, unhandled, disposed, visibility: track.style.visibility,
          opacity: track.style.opacity, pointerEvents: track.style.pointerEvents,
          overlays: viewport.querySelectorAll('.carousel__transition').length }
      } finally { owner.destroy(); window.removeEventListener('unhandledrejection', onUnhandled) }
    }, method)
    expect(result).toEqual({ errors: [`Carousel: surface transition ${method}() must be synchronous`],
      unhandled: [], disposed: method === 'createSurfaces' ? 0 : 1, visibility: 'visible', opacity: '', pointerEvents: '', overlays: 0 })
  })
}

test('invalid renderer and throwing cleanup still release the layer and live track', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
    document.body.innerHTML += '<div class="viewport"><div class="track"><div class="slide">A</div><div class="slide">B</div></div></div>'
    const viewport = document.querySelector('.viewport')
    const track = document.querySelector('.track')
    const errors = []
    let disposed = 0
    const owner = new SurfaceTransition(viewport, { kind: 'surfaces', name: 'invalid', createSurfaces() {
      return { render: null, destroy() { disposed++; throw new Error('dispose failed') } }
    } }, { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
      fromIndex: 0, toIndex: 1, direction: 1, orientation: 'horizontal', viewportSize: 400 })
    try { owner.initialize() } catch (error) { errors.push(error.message) }
    try { owner.destroy() } catch (error) { errors.push(error.message) }
    owner.destroy()
    return { errors, disposed, visibility: track.style.visibility, opacity: track.style.opacity, pointerEvents: track.style.pointerEvents,
      overlays: viewport.querySelectorAll('.carousel__transition').length }
  })
  expect(result).toEqual({ errors: ['Carousel: a surface transition must return render(progress) and optional destroy()',
    'dispose failed'], disposed: 1, visibility: '', opacity: '', pointerEvents: '', overlays: 0 })
})

test('snapshots are fixed and do not start embedded players or browsing contexts', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
    document.body.innerHTML += `<div class="viewport"><div class="track"><div class="slide">
      <input value="initial"><video controls autoplay preload="auto"><source src="data:video/mp4;base64,"></video>
      <iframe src="about:blank" width="320" height="90"></iframe>
      <div contenteditable="true" onclick="window.snapshotClicked = true">Editable</div>
      </div><div class="slide">B</div></div></div>`
    const viewport = document.querySelector('.viewport')
    const track = document.querySelector('.track')
    const originalInput = track.querySelector('input')
    originalInput.value = 'captured'
    let context
    const owner = new SurfaceTransition(viewport, { kind: 'surfaces', name: 'passive', createSurfaces(value) {
      context = value
      return { render() {} }
    } }, { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
      fromIndex: 0, toIndex: 1, direction: 1, orientation: 'horizontal', viewportSize: 400 })
    try {
      owner.initialize()
      originalInput.value = 'later update'
      track.children[1].textContent = 'Later destination'
      owner.render(.5)
      const video = context.from.querySelector('video')
      const editable = context.from.querySelector('[contenteditable]')
      return { original: originalInput.value, snapshot: context.from.querySelector('input').value,
        destination: context.to.textContent, browsingContexts: document.querySelectorAll('iframe').length,
        placeholder: !!context.from.querySelector('[data-carousel-snapshot="embedded"]'),
        autoplay: video.autoplay, sourceCount: video.querySelectorAll('source,track').length,
        mediaSource: video.getAttribute('src'), preload: video.preload,
        editable: editable.contentEditable, onclick: editable.hasAttribute('onclick') }
    } finally { owner.destroy() }
  })
  expect(result).toEqual({ original: 'later update', snapshot: 'captured', destination: 'B', browsingContexts: 1,
    placeholder: true, autoplay: false, sourceCount: 0, mediaSource: null, preload: 'none', editable: 'false', onclick: false })
})

test('surface factories animate the independent snapshots for both orientations', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
    const { createSurfaceCrossfade, createSurfacePageTurn } = await import('/src/transitions/surfaces.js')
    document.body.innerHTML += '<div class="viewport"><div class="track"><div class="slide">A</div><div class="slide">B</div></div></div>'
    const viewport = document.querySelector('.viewport')
    const track = document.querySelector('.track')
    const states = []
    for (const [definition, orientation, direction] of [
      [createSurfaceCrossfade(), 'horizontal', 1],
      [createSurfacePageTurn(), 'horizontal', 1],
      [createSurfacePageTurn(), 'vertical', -1],
    ]) {
      const owner = new SurfaceTransition(viewport, definition,
        { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
          fromIndex: 0, toIndex: 1, direction, orientation, viewportSize: 400 })
      try {
        owner.initialize()
        const from = viewport.querySelector('.carousel__surface--from')
        const to = viewport.querySelector('.carousel__surface--to')
        const start = [from.style.opacity, to.style.opacity]
        owner.render(.5)
        const middle = [from.style.opacity, to.style.opacity, from.style.transform]
        owner.render(1)
        states.push({ start, middle, end: [from.style.opacity, to.style.opacity, from.style.transform] })
      } finally { owner.destroy() }
    }
    return { states, visibility: track.style.visibility, overlays: viewport.querySelectorAll('.carousel__transition').length }
  })
  expect(result.states).toEqual([
    { start: ['1', '0'], middle: ['0.5', '0.5', 'none'], end: ['0', '1', 'none'] },
    { start: ['1', '1'], middle: ['1', '1', 'rotateY(-45deg)'], end: ['0', '1', 'rotateY(-90deg)'] },
    { start: ['1', '1'], middle: ['1', '1', 'rotateX(-45deg)'], end: ['0', '1', 'rotateX(-90deg)'] },
  ])
  expect(result.visibility).toBe('')
  expect(result.overlays).toBe(0)
})

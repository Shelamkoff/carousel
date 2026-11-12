import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__decorative_snapshots__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><link rel="stylesheet" href="/styles/carousel.css">
      <style>snapshot-app { display:block; width:140px; height:40px; background:rgb(12,34,56) }</style>
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__decorative_snapshots__')
})

for (const mode of ['loop', 'surface']) {
  test(`${mode} copies never construct another custom app or iframe document`, async ({ page }) => {
    const result = await page.evaluate(async mode => {
      const { Carousel } = await import('/src/index.js')
      const { SurfaceTransition } = await import('/src/transitions/SurfaceTransition.js')
      let apps = 0
      let buttons = 0
      let late = 0
      window.iframeInstances = 0
      customElements.define('snapshot-app', class extends HTMLElement {
        constructor() { super(); apps++; this.attachShadow({ mode: 'closed' }).textContent = 'Private app' }
      })
      customElements.define('snapshot-button', class extends HTMLButtonElement {
        constructor() { super(); buttons++ }
      }, { extends: 'button' })
      let loaded
      const make = () => {
        const article = document.createElement('article')
        const app = document.createElement('snapshot-app')
        app.textContent = 'Light DOM'
        const button = document.createElement('button', { is: 'snapshot-button' })
        // The custom-element identity survives removal of the serialized attr.
        button.removeAttribute('is')
        button.textContent = 'Native presentation'
        const iframe = document.createElement('iframe')
        iframe.width = '170'; iframe.height = '70'
        loaded = new Promise(resolve => iframe.addEventListener('load', resolve, { once: true }))
        iframe.srcdoc = '<script>parent.iframeInstances++<\/script>'
        article.append(app, button, iframe, document.createElement('snapshot-late'))
        return article
      }
      const host = document.createElement('div')
      host.style.cssText = 'width:400px;height:180px;position:relative'
      document.body.append(host)
      let carousel
      let owner
      let surface
      let track
      const captureSurface = () => {
        owner = new SurfaceTransition(host, { kind: 'surfaces', name: 'singleton', createSurfaces({ from }) {
          surface = from
          return { render() {} }
        } }, { fromElement: track.children[0], toElement: track.children[1], trackElement: track,
          fromIndex: 0, toIndex: 1, direction: 1, orientation: 'horizontal', viewportSize: 400 })
        owner.initialize()
      }
      try {
        if (mode === 'loop') {
          carousel = new Carousel(host, [{ content: make }], { loop: true, slidesPerView: 2, transitionDuration: 0 })
        } else {
          track = document.createElement('div')
          const from = document.createElement('div'), to = document.createElement('div')
          from.append(make()); to.textContent = 'Destination'; track.append(from, to); host.append(track)
          captureSurface()
        }
        await loaded
        customElements.define('snapshot-late', class extends HTMLElement {
          constructor() { super(); late++ }
        })
        const inspect = () => {
          const copy = mode === 'loop' ? host.querySelector('[data-carousel-copy]') : surface
          const app = copy.querySelector('[data-carousel-snapshot=custom-element]')
          const frame = copy.querySelector('[data-carousel-snapshot=embedded]')
          const bounds = frame.getBoundingClientRect()
          return { apps, buttons, late, iframes: window.iframeInstances,
            customTags: copy.querySelectorAll('snapshot-app,snapshot-late,[is]').length,
            browsingContexts: copy.querySelectorAll('iframe,object,embed').length,
            lightContent: app.textContent, hostStyle: [app.style.display, app.style.width, app.style.height, app.style.backgroundColor],
            embeddedSize: [frame.style.width, frame.style.height], embeddedBounds: [bounds.width, bounds.height], inert: copy.inert }
        }
        const initial = inspect()
        if (mode === 'loop') carousel.update({ gap: 8 })
        else { owner.destroy(); captureSurface() }
        const rebuilt = inspect()
        if (mode === 'loop') { carousel.refresh(0); await loaded }
        return { initial, rebuilt, refreshed: inspect() }
      } finally { carousel?.destroy(); owner?.destroy(); host.remove() }
    }, mode)
    const expected = { apps: 1, buttons: 1, late: 1, iframes: 1, customTags: 0, browsingContexts: 0,
      lightContent: 'Light DOM', hostStyle: ['block', '140px', '40px', 'rgb(12, 34, 56)'],
      embeddedSize: ['170px', '70px'], embeddedBounds: [174, 74], inert: true }
    expect(result.initial).toEqual(expected)
    expect(result.rebuilt).toEqual(expected)
    expect(result.refreshed).toEqual(mode === 'loop' ? { ...expected, apps: 2, buttons: 2, late: 2, iframes: 2 } : expected)
  })
}

test('loop snapshots capture native state and SVG references without running copied media or handlers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const form = document.createElement('form')
    form.style.width = '400px'; document.body.append(form)
    const article = document.createElement('article')
    article.innerHTML = `<input id="live-input" name="field" value="initial" onclick="window.copiedHandler = true">
      <label for="live-input">Field</label><select multiple name="choice"><option>A</option><option>B</option><option>C</option></select>
      <canvas width="2" height="2"></canvas>
      <svg width="20" height="20"><defs><linearGradient id="loop-paint"><stop stop-color="red"/></linearGradient></defs><rect width="20" height="20" fill="url(#loop-paint)"/></svg>
      <video autoplay src="data:video/mp4,"><source src="data:video/mp4,"><track src="data:text/vtt,"></video>
      <audio autoplay src="data:audio/wav,"><source src="data:audio/wav,"></audio>`
    article.querySelector('input').value = 'Current value'
    article.querySelector('select').options[0].selected = true
    article.querySelector('select').options[2].selected = true
    article.querySelector('canvas').getContext('2d').fillStyle = 'rgb(12,34,56)'
    article.querySelector('canvas').getContext('2d').fillRect(0, 0, 2, 2)
    const carousel = new Carousel(form, [{ content: () => article }], { loop: true, transitionDuration: 0 })
    try {
      carousel.getSlideElement(0).id = 'live-wrapper'
      article.querySelector('input').setAttribute('aria-controls', 'live-wrapper')
      carousel.refresh(0)
      const copy = form.querySelector('[data-carousel-copy]')
      const input = copy.querySelector('input')
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return { value: input.value, selected: [...copy.querySelector('select').selectedOptions].map(node => node.textContent),
        pixel: [...copy.querySelector('canvas').getContext('2d').getImageData(0, 0, 1, 1).data],
        label: copy.querySelector('label').htmlFor === input.id && input.id !== 'live-input',
        wrapperReference: input.getAttribute('aria-controls') === copy.id && copy.id !== 'live-wrapper',
        paint: copy.querySelector('rect').getAttribute('fill') === `url(#${copy.querySelector('linearGradient').id})`,
        silentMedia: [...copy.querySelectorAll('video,audio')].every(node => !node.autoplay && !node.hasAttribute('src') && node.preload === 'none'),
        mediaSources: copy.querySelectorAll('source,track').length, copiedHandler: !!window.copiedHandler,
        form: [...new FormData(form)] }
    } finally { carousel.destroy(); form.remove() }
  })
  expect(result).toEqual({ value: 'Current value', selected: ['A', 'C'], pixel: [12, 34, 56, 255], label: true,
    wrapperReference: true, paint: true, silentMedia: true, mediaSources: 0, copiedHandler: false,
    form: [['field', 'Current value'], ['choice', 'A'], ['choice', 'C']] })
})

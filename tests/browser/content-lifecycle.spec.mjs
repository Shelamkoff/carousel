import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__owned_content__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__owned_content__')
})

test('owned content survives reconciliation and cleans up once per mounted original', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div'); host.style.width = '600px'; document.body.append(host)
    const created = [], disposed = []
    const factory = name => () => {
      const serial = `${name}-${created.filter(value => value.startsWith(name + '-')).length + 1}`
      created.push(serial)
      const element = document.createElement('input'); element.value = serial
      return { element, destroy() { disposed.push({ serial, connected: element.isConnected }) } }
    }
    const slides = [{ id: 'a', content: factory('a') }, { id: 'b', content: factory('b') }]
    const carousel = new Carousel(host, slides, { loop: true, slidesPerView: 2, transitionDuration: 0 })
    try {
      const input = carousel.getSlideElement(0).firstElementChild
      input.value = 'User edit'
      const copies = host.querySelectorAll('[data-carousel-copy]').length
      carousel.updateSlide(0, { meta: { title: 'New metadata' } })
      carousel.moveSlide(0, 1)
      carousel.setSlides(slides.map(slide => ({ ...slide })))
      const retained = input === carousel.getSlideElement(0).firstElementChild && input.value === 'User edit'
      const afterReconciliation = { created: [...created], disposed: [...disposed] }
      carousel.updateSlide(0, { content: factory('replacement') })
      carousel.setSlides([slides[1]])
      carousel.refresh(0)
      carousel.destroy()
      return { copies, retained, afterReconciliation, created, disposed }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result.copies).toBeGreaterThan(0)
  expect(result.retained).toBe(true)
  expect(result.afterReconciliation).toEqual({ created: ['a-1', 'b-1'], disposed: [] })
  expect(result.created).toEqual(['a-1', 'b-1', 'replacement-1', 'b-2'])
  expect(result.disposed).toEqual(['a-1', 'replacement-1', 'b-1', 'b-2'].map(serial => ({ serial, connected: true })))
})

test('a late resource returned after collection replacement is disposed without attachment', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div'); host.style.width = '400px'; document.body.append(host)
    const disposed = []
    const carousel = new Carousel(host, [{ id: 'old', content: () => ({
      element: document.createElement('article'), destroy() { disposed.push('old') },
    }) }], { transitionDuration: 0 })
    try {
      let attached = false
      carousel.updateSlide(0, { content: () => {
        carousel.setSlides([{ id: 'winner', content: '<article>Latest collection</article>' }])
        const element = document.createElement('article')
        return { element, destroy() { disposed.push('late'); attached = element.isConnected } }
      } })
      const text = carousel.getSlideElement(0).textContent
      carousel.destroy()
      return { text, disposed, attached }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({ text: 'Latest collection', disposed: ['old', 'late'], attached: false })
})

test('cleanup reentry supersedes the outer replacement and preserves its newest resource', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div'); host.style.width = '400px'; document.body.append(host)
    const calls = []
    let carousel
    carousel = new Carousel(host, [{ id: 'old', content: () => ({
      element: document.createElement('article'), destroy() {
        calls.push('old destroy')
        carousel.setSlides([{ id: 'winner', content: () => ({
          element: Object.assign(document.createElement('article'), { textContent: 'Winner' }),
          destroy() { calls.push('winner destroy') },
        }) }])
      },
    }) }], { transitionDuration: 0 })
    try {
      carousel.updateSlide(0, { content: () => { calls.push('retired factory'); return document.createElement('article') } })
      const text = carousel.getSlideElement(0).textContent
      carousel.destroy()
      return { text, calls }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({ text: 'Winner', calls: ['old destroy', 'winner destroy'] })
})

test('cleanup failures use slide:error and do not prevent other resources from retiring', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Carousel } = await import('/src/index.js')
    const host = document.createElement('div'); host.style.width = '400px'; document.body.append(host)
    const calls = [], errors = []
    const carousel = new Carousel(host, ['first', 'second'].map(name => ({ id: name, content: () => ({
      element: document.createElement('article'), destroy() {
        calls.push(name)
        if (name === 'first') throw new Error('External cleanup failed')
      },
    }) })), { transitionDuration: 0 })
    carousel.on('slide:error', ({ index, error }) => errors.push({ index, message: error.message }))
    try {
      carousel.destroy()
      return { calls, errors, removed: !host.firstElementChild }
    } finally { carousel.destroy(); host.remove() }
  })
  expect(result).toEqual({ calls: ['first', 'second'],
    errors: [{ index: 0, message: 'External cleanup failed' }], removed: true })
})

test('targeted renderer updates preserve unrelated originals and copies without metadata DOM work', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { TrackRenderer } = await import('/src/TrackRenderer.js')
    const host = document.createElement('div'); host.style.width = '600px'; document.body.append(host)
    const renders = [0, 0, 0]
    const slides = renders.map((_, index) => ({ content: () => {
      renders[index]++
      const element = document.createElement('article')
      element.style.height = '100px'; element.textContent = String(index)
      return element
    } }))
    const renderer = new TrackRenderer()
    renderer.build(host, slides, { slidesPerView: 3, gap: 0, loop: true, keys: slides.map(() => ({})) })
    try {
      const originals = renderer.getSlideElements()
      const children = originals.map(element => element.firstElementChild)
      const copies = [...host.querySelectorAll('[data-carousel-copy]')]
      const copyChildren = copies.map(element => element.firstElementChild)
      const observer = new MutationObserver(() => {})
      observer.observe(renderer.getTrack(), { childList: true, subtree: true, attributes: true })
      const revision = renderer.revision
      const metadata = renderer.updateSlide(1, { ...slides[1], meta: { title: 'Updated' }, thumb: 'thumb.jpg' })
      const metadataResult = { valid: metadata, mutations: observer.takeRecords().length, revision: renderer.revision === revision }
      observer.disconnect()

      let replacementRenders = 0
      const changed = { content: () => {
        replacementRenders++
        const element = document.createElement('article')
        element.style.height = '200px'; element.textContent = 'Changed'
        return element
      } }
      const updated = renderer.updateSlide(1, changed, { refreshContent: true })
      const retained = [0, 2].every(index => originals[index].firstElementChild === children[index]
        && copies[index].firstElementChild === copyChildren[index])
      const target = { original: originals[1].textContent, copy: copies[1].textContent, height: renderer.getTrack().style.height }
      const pending = { ...changed, lazy: true }
      renderer.updateSlide(1, pending, { refreshContent: true })
      const cleared = originals[1].childElementCount === 0 && copies[1].childElementCount === 0
      const loaded = renderer.renderSlide(1, pending)
      return { metadataResult, updated, retained, target, cleared, loaded, renders, replacementRenders,
        sameWrappers: renderer.getSlideElements().every((element, index) => element === originals[index]) }
    } finally { renderer.destroy(); host.remove() }
  })
  expect(result).toEqual({ metadataResult: { valid: true, mutations: 0, revision: true }, updated: true, retained: true,
    target: { original: 'Changed', copy: 'Changed', height: '200px' }, cleared: true, loaded: true,
    renders: [1, 1, 1], replacementRenders: 2, sameWrappers: true })
})

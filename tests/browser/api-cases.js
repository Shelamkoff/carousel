import { Carousel, createSlideEffect, createFocusEffect, createParallax, createDots,
  createArrows, createControls, createLazyLoad } from '../../src/index.js'

const check = (condition, message) => { if (!condition) throw new Error(message) }
const frame = () => new Promise(requestAnimationFrame)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

function mount(options = {}, count = 4) {
  const host = document.createElement('form')
  host.style.cssText = 'width:700px;--carousel-expand-height:260px'
  document.body.append(host)
  const renders = []
  const slides = Array.from({ length: count }, (_, index) => ({ id: `card-${index}`, content: () => {
    renders.push(index)
    const card = document.createElement('article')
    card.className = 'api-card'
    card.style.cssText = 'height:220px;background:lightblue'
    card.innerHTML = `<h3>Card ${index}</h3><input name="field-${index}" value="initial-${index}">`
    return card
  } }))
  const carousel = new Carousel(host, slides, { transitionDuration: 0, ...options })
  return { carousel, host, slides, renders, destroy() { carousel.destroy(); host.remove() } }
}

export const scenarios = {
  async 'keyed reconciliation preserves focused nodes, values and selection'() {
    const f = mount()
    try {
      const nodes = f.carousel.getSlideElements()
      const input = nodes[0].querySelector('input')
      input.value = 'user-entered content'; input.focus(); input.setSelectionRange(3, 9)
      f.carousel.moveSlide(0, 2)
      check(f.carousel.getIndex() === 2, 'selected identity must follow move')
      check(f.carousel.getSlideElement(2) === nodes[0], 'move must reuse the slide wrapper')
      check(document.activeElement === input && input.selectionStart === 3, 'move must preserve focus and selection')
      f.carousel.setSlides([f.slides[3], f.slides[0], f.slides[2], f.slides[1]].map(slide => ({ ...slide })))
      check(f.carousel.getIndex() === 1, 'immutable keyed reorder must preserve selection')
      check(f.carousel.getSlideElement(1).querySelector('input') === input, 'keyed set must not recreate inputs')
      check(input.value === 'user-entered content', 'input data must survive')
      check(f.renders.length === 4, 'unchanged content renderers must not run again')
      f.carousel.update({ gap: 12, orientation: 'vertical', viewportHeight: 350 })
      check(f.carousel.getSlideElement(1).querySelector('input') === input, 'option update must preserve descendants')
    } finally { f.destroy() }
  },

  async 'fallback DOM moves restore focus without replacing controls'() {
    const f = mount()
    try {
      const track = f.host.querySelector('.carousel__track')
      Object.defineProperty(track, 'moveBefore', { value: undefined })
      const input = f.carousel.getSlideElement(0).querySelector('input')
      input.focus(); input.value = 'kept'; input.setSelectionRange(1, 3)
      f.carousel.moveSlide(0, 3)
      check(f.carousel.getSlideElement(3).querySelector('input') === input, 'fallback must reuse content')
      check(document.activeElement === input && input.value === 'kept', 'fallback must restore focus and value')
      check(input.selectionStart === 1 && input.selectionEnd === 3, 'fallback must preserve selection')
    } finally { f.destroy() }
  },

  async 'point updates and refresh affect only the requested slide'() {
    const f = mount()
    try {
      const inputs = f.carousel.getSlideElements().map(slide => slide.querySelector('input'))
      inputs[0].value = 'kept'
      f.carousel.updateSlide(1, { meta: { price: 25 } })
      check(f.renders.length === 4, 'metadata-only update must not run renderers')
      f.carousel.updateSlide(1, { content: '<article style="height:180px">Replacement</article>' })
      check(f.carousel.getSlideElement(1).textContent === 'Replacement', 'target content must change')
      check(inputs[0] === f.carousel.getSlideElement(0).querySelector('input'), 'neighbor DOM must remain')
      f.carousel.refresh(2)
      check(f.renders.join(',') === '0,1,2,3,2', 'refresh must run only its requested renderer')
      check(inputs[0].value === 'kept', 'refresh must not reset neighbor values')
    } finally { f.destroy() }
  },

  async 'bulk replacement updates controls and preserves finite fallback selection'() {
    const f = mount({ plugins: [createDots(), createArrows(), createControls({ playPause: false, progress: false })] })
    try {
      f.carousel.goTo(3)
      f.carousel.setSlides(f.slides.slice(0, 2))
      check(f.carousel.getIndex() === 1, 'removed selection must fall back to a valid nearest index')
      check(f.host.querySelectorAll('.carousel__dot').length === 2, 'pagination must reconcile')
      check(f.host.querySelector('.carousel__counter').textContent.includes('2 / 2'), 'counter must reconcile')
      f.carousel.setSlides([])
      check(f.carousel.getIndex() === 0 && !f.carousel.getSlide(), 'empty collection must have no selected slide')
      check(f.host.querySelector('.carousel__counter').textContent.includes('0 / 0'), 'empty counter must be correct')
      f.carousel.setSlides(f.slides)
      check(f.carousel.getSlideCount() === 4, 'repopulated collection must work')
    } finally { f.destroy() }
  },

  async 'short loops restore managed styles on originals and copies after rebuild'() {
    const f = mount({ loop: true, slidesPerView: 2.5 }, 2)
    const effect = createSlideEffect({ name: 'copy-styles', create({ setStyle }) {
      return { render(state) { for (const slot of state.slides) setStyle(slot.element.firstElementChild, 'opacity', '.35') } }
    } })
    try {
      f.carousel.getSlideElements().forEach(slide => slide.firstElementChild.style.setProperty('opacity', '.9', 'important'))
      f.carousel.use(effect)
      f.carousel.update({ gap: 13 })
      check([...f.host.querySelectorAll('.api-card')].every(node => node.style.opacity === '0.35'), 'copies must receive effects')
      f.carousel.unuse(effect.name)
      check([...f.host.querySelectorAll('.api-card')].every(node => node.style.opacity === '0.9'), 'copies must restore clean baselines, not old effect styles')
      check([...f.host.querySelectorAll('.api-card')].every(node => node.style.getPropertyPriority('opacity') === 'important'), 'style priority must survive')
      const copies = [...f.host.querySelectorAll('[data-carousel-copy]')]
      check(copies.length > 0 && copies.every(slide => slide.inert), 'replicas must stay inert')
      check([...new FormData(f.host)].length === 2, 'visual replicas must not duplicate submitted values')
    } finally { f.destroy() }
  },

  async 'effects receive frame progress for slide, fade and cover transitions'() {
    for (const transition of ['slide', 'fade', 'pixel']) {
      const f = mount({ transition, transitionDuration: 120 })
      try {
        const frames = []
        f.carousel.use(createSlideEffect({ name: 'timeline', create() { return { render(value) { frames.push(value) } } } }))
        const done = new Promise(resolve => f.carousel.once('transition:end', resolve))
        f.carousel.next(); await done; await frame()
        check(frames.some(value => value.transitionProgress > 0 && value.transitionProgress < 1), `${transition} must share intermediate frames`)
        check(frames.some(value => value.phase === 'idle' && value.index === 1), `${transition} must publish settled state`)
        if (transition === 'fade') {
          check(frames.some(value => value.slides[0].focus > 0 && value.slides[0].focus < 1), 'fade needs continuous outgoing focus')
        }
        f.carousel.next(); f.carousel.update({ gap: 10 })
        const count = frames.length
        await pause(220)
        check(frames.length === count, `${transition} must not publish retired frames`)
      } finally { f.destroy() }
    }
  },

  async 'parallax wrapping preserves native focus and custom element connections'() {
    let connections = 0
    if (!customElements.get('api-native-probe')) customElements.define('api-native-probe', class extends HTMLElement {
      connectedCallback() { this.dispatchEvent(new Event('probe-connect', { bubbles: true })) }
      connectedMoveCallback() {}
    })
    const f = mount()
    try {
      f.host.addEventListener('probe-connect', () => connections++)
      f.carousel.getSlideElement(0).firstElementChild.appendChild(document.createElement('api-native-probe'))
      const input = f.carousel.getSlideElement(0).querySelector('input')
      input.focus(); input.setSelectionRange(1, 4)
      const initial = connections
      f.carousel.use(createParallax())
      f.carousel.updateSlide(0, { meta: { title: 'new title' } })
      f.carousel.unuse('parallax')
      check(document.activeElement === input && input.selectionEnd === 4, 'parallax lifecycle must preserve focus and selection')
      if (typeof Element.prototype.moveBefore === 'function') check(connections === initial, 'atomic wrapping must not reconnect custom elements')
    } finally { f.destroy() }
  },

  async 'focus effects compose with parallax without duplicated descendant transforms'() {
    const f = mount({ plugins: [createFocusEffect(), createParallax()] })
    try {
      f.carousel.goTo(1)
      const slide = f.carousel.getSlideElement(0)
      const card = slide.querySelector('.api-card')
      check(card.style.scale === '', 'previous direct-child target must release its scale after wrapping')
      check(slide.firstElementChild.style.scale === '0.9', 'current target must receive focus scale')
      f.carousel.unuse('parallax')
      f.carousel.goTo(2)
      check(card.style.scale === '0.9', 'effect must follow the restored direct child')
      f.carousel.unuse('effect:focus')
      check(card.style.scale === '', 'effect teardown must restore target scale')
    } finally { f.destroy() }
  },

  async 'custom layouts expose geometry and fail closed on invalid results'() {
    let bad = false
    const f = mount({ layout: { name: 'stack', render(context) {
      return bad ? [{ offset: Infinity, size: 12 }] : context.slides.map(slot => ({
        offset: slot.offset * .5, size: slot.size * .75, progress: slot.progress,
      }))
    } } })
    try {
      check(f.carousel.getSlideElement(0).getBoundingClientRect().width === 525, 'custom card width must apply')
      f.carousel.goTo(1)
      check(f.carousel.getRenderState().slides[1].offset === 0, 'selected card must follow canonical navigation')
      const errors = []; f.carousel.on('layout:error', value => errors.push(value))
      bad = true; f.carousel.next(); f.carousel.prev()
      check(errors.length === 1, 'broken layout must be isolated until a reconfiguration')
      check(f.carousel.getRenderState().slides.every(slot => Number.isFinite(slot.offset)), 'no partial invalid geometry')
      f.carousel.update({ layout: 'standard' })
      check(f.carousel.getSlideElement(0).getBoundingClientRect().width === 700, 'standard layout must restore widths')
    } finally { f.destroy() }
  },

  async 'effect failures cannot change core positioning or retain owned styles'() {
    const f = mount()
    let disposed = 0
    const errors = []
    f.carousel.on('effect:error', value => errors.push(value))
    try {
      f.carousel.use(createSlideEffect({ name: 'invalid-owner', create({ setStyle }) {
        return { render(state) {
          setStyle(state.slides[0].element.firstElementChild, 'opacity', '.3')
          setStyle(state.slides[0].element, 'transform', 'scale(8)')
        }, destroy() { disposed++ } }
      } }))
      check(errors.length === 1 && disposed === 1, 'invalid core styling must disable and dispose effect')
      check(f.carousel.getSlideElement(0).firstElementChild.style.opacity === '', 'partially applied effects must roll back')
      f.carousel.next()
      check(f.carousel.getIndex() === 1, 'navigation must survive effect failure')
      f.carousel.unuse('effect:invalid-owner')
      check(disposed === 1, 'failed effect destructor must not repeat')
    } finally { f.destroy() }
  },

  async 'reentrant effects cannot apply a stale frame after collection replacement'() {
    const f = mount()
    let changed = false
    const effect = createSlideEffect({ name: 'replace-during-render', create({ setStyle }) {
      return { render(state) {
        if (!changed && state.phase === 'animation') {
          changed = true
          f.carousel.setSlides([{ id: 'new', content: '<article>new</article>' }])
          setStyle(state.slides[0].element, '--stale', 'true')
        }
      } }
    } })
    try {
      f.carousel.use(effect)
      f.carousel.next()
      await Promise.resolve()
      check(f.carousel.getSlideCount() === 1 && f.carousel.getSlide().id === 'new', 'new collection must win')
      check(!f.host.querySelector('[style*="--stale"]'), 'old frame must not write into replacement DOM')
    } finally { f.destroy() }
  },

  async 'reduced motion removes positional effect displacement without removing state'() {
    const f = mount({ plugins: [createFocusEffect({ offset: 35 })], transitionDuration: 500 })
    try {
      check(f.carousel.getRenderState().reducedMotion, 'test requires reduced-motion preference')
      f.carousel.next()
      check(f.carousel.getIndex() === 1, 'reduced-motion navigation must settle synchronously')
      for (const slide of f.carousel.getSlideElements()) {
        check(slide.firstElementChild.style.scale === '1', 'reduced-motion must remove focus zoom')
        check(slide.firstElementChild.style.translate === '0px', 'reduced-motion must remove displacement')
      }
    } finally { f.destroy() }
  },
}

import { Carousel, createArrows, createDots, createKeyboard, createParallax, createSwipe } from '../../src/index.js'
import { TrackRenderer } from '../../src/TrackRenderer.js'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function go(carousel, action) {
  const done = new Promise(resolve => carousel.once('transition:end', resolve))
  action()
  await Promise.race([done, delay(1000).then(() => { throw new Error('navigation timeout') })])
}

const result = document.querySelector('#result')
try {
  const host = document.querySelector('#host')
  const slides = ['one', 'two', 'three'].map(content => ({ content }))
  const carousel = new Carousel(host, slides, {
    loop: true,
    startIndex: 2,
    transition: 'fade',
    transitionDuration: 0,
    slidesPerView: 2,
    plugins: [createArrows(), createDots(), createKeyboard(), createSwipe({ mouse: true }), createParallax()],
  })
  assert(carousel.getIndex() === 2, 'start index was not preserved')
  await go(carousel, () => carousel.next())
  assert(carousel.getIndex() === 0, 'loop fade did not wrap last to first')
  carousel.addSlide({ content: 'inserted' }, 1)
  assert(carousel.getSlides().length === 4, 'addSlide failed')
  carousel.removeSlide(1)
  assert(carousel.getSlides().length === 3, 'removeSlide failed')
  let invalidIndexRejected = false
  try { carousel.goTo(1.5) } catch { invalidIndexRejected = true }
  assert(invalidIndexRejected, 'fractional navigation index was accepted')
  const retainedArrow = host.querySelector('.carousel__arrow--next')
  carousel.destroy()
  retainedArrow.click()
  assert(!host.querySelector('.carousel'), 'destroy left carousel DOM mounted')

  const ownerHostA = document.createElement('div')
  const ownerHostB = document.createElement('div')
  document.body.append(ownerHostA, ownerHostB)
  const sharedPlugin = { name: 'single-owner', install() {} }
  const ownerA = new Carousel(ownerHostA, slides)
  const ownerB = new Carousel(ownerHostB, slides)
  ownerA.use(sharedPlugin)
  let sharedPluginRejected = false
  try { ownerB.use(sharedPlugin) } catch { sharedPluginRejected = true }
  assert(sharedPluginRejected, 'one plugin instance was accepted by two carousels')
  ownerA.destroy()
  ownerB.use(sharedPlugin)
  ownerB.destroy()
  ownerHostA.remove()
  ownerHostB.remove()

  const fractionalHost = document.createElement('div')
  fractionalHost.style.width = '600px'
  document.body.appendChild(fractionalHost)
  const fractional = new Carousel(fractionalHost, slides, {
    slidesPerView: 2.5,
    slidesPerScroll: 'auto',
    transitionDuration: 0,
  })
  await go(fractional, () => fractional.next())
  assert(fractional.getIndex() === 1, 'auto scroll produced a fractional slide index')
  fractional.destroy()
  fractionalHost.remove()

  const loopFadeHost = document.createElement('div')
  loopFadeHost.style.width = '600px'
  document.body.appendChild(loopFadeHost)
  const loopFade = new Carousel(loopFadeHost, slides, {
    loop: true,
    transition: 'fade',
    transitionDuration: 0,
  })
  await go(loopFade, () => loopFade.next())
  const loopFadeSlides = [...loopFadeHost.querySelectorAll('.carousel__slide')]
  assert(loopFadeSlides.every(slide => slide.style.position === 'absolute'), 'loop fade removed absolute slide positioning')
  assert(loopFadeHost.querySelector('.carousel__track').style.height !== '', 'loop fade lost track height')
  loopFade.destroy()
  loopFadeHost.remove()

  const swipeHost = document.createElement('div')
  swipeHost.style.width = '600px'
  document.body.appendChild(swipeHost)
  const swipeCarousel = new Carousel(swipeHost, slides, {
    transitionDuration: 0,
    plugins: [createSwipe()],
  })
  const swipeViewport = swipeHost.querySelector('.carousel__viewport')
  swipeViewport.setPointerCapture = () => {}
  swipeViewport.releasePointerCapture = () => {}
  swipeViewport.dispatchEvent(new PointerEvent('pointerdown', {
    pointerId: 10, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 0,
  }))
  swipeViewport.dispatchEvent(new PointerEvent('pointerdown', {
    pointerId: 11, pointerType: 'touch', isPrimary: false, button: 0, clientX: 90, clientY: 0,
  }))
  window.dispatchEvent(new PointerEvent('pointermove', {
    pointerId: 10, pointerType: 'touch', isPrimary: true, clientX: 50, clientY: 0, cancelable: true,
  }))
  assert(swipeHost.querySelector('.carousel__track').style.transform.includes('-50px'), 'second touch stole the active swipe')
  window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 10, pointerType: 'touch' }))
  swipeCarousel.destroy()
  swipeHost.remove()

  const renderHost = document.createElement('div')
  renderHost.style.width = '600px'
  document.body.appendChild(renderHost)
  let failOnRebuild = false
  const resilient = new Carousel(renderHost, [
    { content: () => document.createElement('span') },
    { content: () => {
      if (failOnRebuild) throw new Error('render failure')
      return document.createElement('span')
    } },
  ], { transitionDuration: 0 })
  let renderErrors = 0
  resilient.on('slide:error', ({ index, error }) => {
    if (index === 1 && error.message === 'render failure') renderErrors++
  })
  failOnRebuild = true
  resilient.update({ gap: 1 })
  assert(renderErrors === 1, 'rebuild render failure was not isolated')
  assert(renderHost.querySelectorAll('.carousel__slide').length === 2, 'render failure corrupted rebuilt DOM')
  resilient.destroy()
  renderHost.remove()

  const heightHost = document.createElement('div')
  heightHost.style.width = '600px'
  document.body.appendChild(heightHost)
  const dynamicContent = document.createElement('div')
  dynamicContent.style.height = '20px'
  const heightAware = new TrackRenderer()
  heightAware.build(heightHost, [
    { content: dynamicContent },
    { content: 'second' },
  ], { loop: true, slidesPerView: 1, gap: 0 })
  const renderedDynamicContent = heightHost.querySelector('.carousel__slide > div')
  renderedDynamicContent.style.height = '80px'
  heightAware.refreshLayout()
  assert(heightHost.querySelector('.carousel__track').style.height === '80px', 'loop track ignored an asynchronous slide resize')
  heightAware.destroy()
  heightHost.remove()

  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify({ loopWrap: true, plugins: 5, fractionalAutoScroll: 1 })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}

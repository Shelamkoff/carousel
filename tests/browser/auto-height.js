import { Carousel } from '../../dist/src/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const cases = [], errors = []
let phase = 'setup'
window.addEventListener('error', event => errors.push({ phase, message: event.message }))
window.addEventListener('unhandledrejection', event => errors.push({ phase, message: String(event.reason) }))
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const settle = async () => { for (let count = 0; count < 6; count++) await new Promise(requestAnimationFrame) }

async function autoHeight(mounted, loop) {
  phase = `${mounted ? 'mounted' : 'detached'}-loop-${loop}`
  const host = document.createElement('section'); host.style.width = '640px'
  const figures = await Promise.all(['Alpha', 'Bravo'].map(async caption => {
    const figure = document.createElement('figure'); figure.style.margin = '0'
    const image = document.createElement('img'); image.src = pixel
    image.style.cssText = 'display:block;width:100%;height:auto'
    await image.decode()
    const label = document.createElement('figcaption'); label.textContent = caption; label.style.height = '23px'
    figure.append(image, label)
    return figure
  }))
  if (mounted) document.body.append(host)
  const carousel = new Carousel(host, figures.map(content => ({ content: () => content })), { loop, transitionDuration: 0 })
  try {
    let invalidOptionsRejected = false
    try { carousel.update([]) } catch (error) { invalidOptionsRejected = error instanceof TypeError }
    assert(invalidOptionsRejected, phase + ': array options must remain rejected as in the published package')
    if (!mounted) document.body.append(host)
    const snapshot = () => ({
      width: host.querySelector('.carousel__viewport').offsetWidth,
      height: host.querySelector('.carousel__viewport').offsetHeight,
      widths: [...host.querySelectorAll('.carousel__slide')].map(slide => slide.offsetWidth),
      heights: [...host.querySelectorAll('.carousel__slide')].map(slide => slide.offsetHeight),
      index: carousel.getIndex(),
    })
    await settle(); const attached = snapshot()
    carousel.goTo(1); host.style.width = '320px'
    await settle(); const resized = snapshot()
    figures[1].querySelector('figcaption').style.height = '47px'
    await settle(); const grown = snapshot()
    assert(attached.width === 640 && attached.widths.every(width => width === 640), phase + ': attached widths')
    assert(resized.width === 320 && resized.widths.every(width => width === 320), phase + ': resized widths')
    assert(attached.height - resized.height === 320, phase + ': intrinsic media height did not shrink')
    assert(resized.height === Math.max(...resized.heights), phase + ': resized track height')
    assert(grown.height - resized.height === 24 && grown.height === Math.max(...grown.heights), phase + ': dynamic content height')
    assert(resized.index === 1 && grown.index === 1, phase + ': logical index changed')
    carousel.destroy(); await settle()
    assert(host.childElementCount === 0, phase + ': owned DOM not removed')
    cases.push({ id: phase, attached, resized, grown, invalidOptionsRejected, disposed: true })
  } finally { carousel.destroy(); host.remove() }
}

try {
  for (const loop of [false, true]) for (const mounted of [false, true]) await autoHeight(mounted, loop)
  phase = 'complete'; await settle()
  document.querySelector('#result').textContent = JSON.stringify({ cases, errors }, null, 2)
  document.body.dataset.status = errors.length ? 'fail' : 'pass'
} catch (error) {
  document.querySelector('#result').textContent = JSON.stringify({ cases, errors, failure: String(error.stack ?? error) }, null, 2)
  document.body.dataset.status = 'fail'
}

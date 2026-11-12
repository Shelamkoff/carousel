import { moveElement } from '../dom.js'

/** Parallax is a render consumer, not an independent animation controller. */
export function createParallax(options = {}) {
  const factor = options.factor ?? .2
  if (!Number.isFinite(factor)) throw new TypeError('Carousel parallax factor must be finite')
  const strength = Math.max(0, Math.min(1, factor))
  let context = null
  let unsubscribers = []
  let layers = new Map()
  let revision = 0
  const childWithClass = (parent, name) => [...parent.children]
    .find(child => child.classList.contains(name)) ?? null

  function unwrap() {
    ++revision
    const retired = layers
    layers = new Map()
    for (const [slide, layer] of retired) {
      const wrapper = layer.parentNode
      if (wrapper?.parentNode !== slide) continue
      for (const child of [...layer.childNodes ?? layer.children]) moveElement(slide, child, wrapper)
      wrapper.remove()
    }
  }

  function render(frame) {
    if (!context || !frame) return
    const owner = context
    const version = revision
    const current = () => owner === context && version === revision
    for (const slot of frame.slides) {
      if (!current()) return
      const slide = slot.element
      let wrapper = childWithClass(slide, 'carousel__parallax')
      if (!wrapper) {
        const children = [...slide.childNodes ?? slide.children]
        const document = slide.ownerDocument ?? globalThis.document
        wrapper = document.createElement('div')
        wrapper.className = 'carousel__parallax'
        const layer = document.createElement('div')
        layer.className = 'carousel__parallax__layer'
        // Attach the destination first so atomic moves preserve native state.
        wrapper.appendChild(layer)
        slide.appendChild(wrapper)
        layers.set(slide, layer)
        for (const child of children) {
          moveElement(layer, child)
          if (!current()) return
        }
      }
      const layer = childWithClass(wrapper, 'carousel__parallax__layer')
      if (!layer) continue
      layers.set(slide, layer)
      const translate = frame.reducedMotion ? 0 : slot.progress * -strength * 100
      layer.style.transform = `${frame.orientation === 'vertical' ? 'translateY' : 'translateX'}(${translate}%)`
    }
  }

  return {
    name: 'parallax',
    install(ctx) {
      context = ctx
      ++revision
      unsubscribers = [
        ctx.on('render', render),
        ctx.on('render:reset', unwrap),
        ctx.on('slide:lazyload', () => render(ctx.getRenderState())),
        ctx.on('resize', () => render(ctx.getRenderState())),
      ]
      render(ctx.getRenderState())
    },
    destroy() {
      context = null
      for (const unsubscribe of unsubscribers) unsubscribe()
      unsubscribers = []
      unwrap()
    },
  }
}

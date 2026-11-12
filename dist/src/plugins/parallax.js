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

  function unwrap(scope) {
    const version = ++revision
    const indices = scope ? new Set(scope.indices) : null
    const retired = []
    for (const entry of layers) {
      if (!indices || indices.has(Number(entry[0].dataset?.index))) retired.push(entry)
    }
    for (const [slide, layer] of retired) {
      if (version !== revision) return
      if (layers.get(slide) !== layer) continue
      const wrapper = layer.parentNode
      if (wrapper?.parentNode === slide) {
        // Keep pending ownership visible to a nested reset or unuse invoked
        // by custom-element move callbacks. It can finish retiring this layer.
        for (const child of [...layer.childNodes ?? layer.children]) {
          if (layer.parentNode !== wrapper || wrapper.parentNode !== slide) break
          if (child.parentNode !== layer) continue
          moveElement(slide, child, wrapper)
          if (version !== revision) return
        }
        if (layer.parentNode === wrapper && wrapper.parentNode === slide) wrapper.remove()
      }
      if (layers.get(slide) === layer) layers.delete(slide)
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
      let layer = layers.get(slide)
      let wrapper = layer?.parentNode
      // Frameworks can replace slide descendants without a carousel reset.
      // Reuse a layer only while its direct parent chain and classes agree.
      if (wrapper?.parentNode !== slide
        || !wrapper.classList.contains('carousel__parallax')
        || !layer.classList.contains('carousel__parallax__layer')) {
        wrapper = childWithClass(slide, 'carousel__parallax')
        layer = wrapper && childWithClass(wrapper, 'carousel__parallax__layer')
      }
      if (!wrapper) {
        const children = [...slide.childNodes ?? slide.children]
        const document = slide.ownerDocument ?? globalThis.document
        wrapper = document.createElement('div')
        wrapper.className = 'carousel__parallax'
        layer = document.createElement('div')
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

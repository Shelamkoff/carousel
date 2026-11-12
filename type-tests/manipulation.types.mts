import {
  Carousel, createSlideEffect, createFocusEffect,
  type CarouselLayoutDefinition, type CarouselRenderState,
} from '../src/index.js'

const host = document.createElement('div')
const carousel = new Carousel(host, [{ id: 'first', content: 'first' }] as const)
carousel.updateSlide(0, { meta: { price: 12 }, thumb: 'preview.png' })
carousel.moveSlide(0, 0)
carousel.setSlides([{ id: 1, content: () => document.createElement('input') }] as const)
carousel.refresh(0)
// @ts-expect-error ids cannot change through updateSlide
carousel.updateSlide(0, { id: 'another' })
// @ts-expect-error content must be supported by SlideData
carousel.updateSlide(0, { content: Promise.resolve('no') })

const layout: CarouselLayoutDefinition = {
  name: 'stack',
  render({ slides }) {
    // @ts-expect-error snapshots are readonly
    slides[0].offset = 2
    return slides.map(slide => ({ offset: slide.offset * .7, size: slide.size, progress: slide.progress }))
  },
}
carousel.update({ layout })
// @ts-expect-error asynchronous layout geometry is not supported
carousel.update({ layout: { name: 'async', render: async () => [] } })

const effect = createSlideEffect({
  name: 'caption',
  create({ setStyle }) {
    return { render(frame) {
      const state: CarouselRenderState = frame
      for (const slide of state.slides) {
        setStyle(slide.element.querySelector<HTMLElement>('.caption'), 'opacity', String(slide.focus))
        // @ts-expect-error progress cannot be mutated
        slide.progress = 0
      }
    } }
  },
})
carousel.use(effect).use(createFocusEffect({ opacity: .7, selector: '.card' }))
carousel.unuse(effect.name)
carousel.on('render', frame => { const progress: number | null = frame.transitionProgress; void progress })
carousel.on('slides:change', ({ count, type }) => { const size: number = count; void [size, type] })
carousel.on('effect:error', ({ name, error }) => { const message: string = error.message; void [name, message] })
carousel.use({ name: 'application', install(ctx) {
  ctx.updateSlide(0, { lazy: false })
  ctx.setSlides([])
  ctx.getRenderState()?.slides.forEach(slide => void slide.visible)
} })

import {
  Carousel, createSurfaceCrossfade, createSurfacePageTurn,
  type CarouselGeometryContext, type CarouselGeometryDefinition, type CarouselGeometryMeasurement,
  type CarouselNavigationGeometry, type CarouselLayoutDefinition, type CarouselPlugin,
  type SlideContentFactory, type SlideContentInstance, type SlideData,
  type CarouselSurfaceTransitionDefinition,
} from '../src/index.js'

const geometry: CarouselGeometryDefinition = {
  name: 'variable',
  measure(context) {
    const typedContext: CarouselGeometryContext = context
    let offset = 0
    const measurement: CarouselGeometryMeasurement = {
      slides: typedContext.slides.map(({ index, id, meta }) => {
        const size = typeof meta?.width === 'number' ? meta.width : context.viewportSize / 2
        const result = { offset, size }
        offset += size + context.gap
        const key: string | number | undefined = id
        void [index, key]
        return result
      }),
    }
    // @ts-expect-error measurement inputs are readonly
    context.slides[0].index = 1
    // @ts-expect-error physical measurement has no DOM content
    context.slides[0].content
    return measurement
  },
}

const layout: CarouselLayoutDefinition = {
  name: 'compressed', visibleSlides: 3.5,
  render({ slides, logicalPosition }) {
    const position: number = logicalPosition
    return slides.map(slide => ({ offset: slide.offset, size: slide.size, progress: slide.index - position }))
  },
}

const factory: SlideContentFactory = () => {
  const element = document.createElement('article')
  const controller = new AbortController()
  const instance: SlideContentInstance = { element, destroy() { controller.abort() } }
  return instance
}
const slides: readonly SlideData[] = [{ id: 'first', content: factory, meta: { width: 160 } }]

const transition: CarouselSurfaceTransitionDefinition = {
  kind: 'surfaces', name: 'fade', commitAt: .7,
  createSurfaces({ from, to, container, direction, fromIndex, toIndex, orientation, viewportSize }) {
    const surface: HTMLElement = from
    const axis: 'horizontal' | 'vertical' = orientation
    void [container, direction, fromIndex, toIndex, viewportSize, surface, axis]
    return { render(progress) { from.style.opacity = String(1 - progress); to.style.opacity = String(progress) } }
  },
}

const plugin: CarouselPlugin = {
  name: 'geometry-consumer',
  install(context) {
    const next: number = context.getNavigationTarget(1)
    const previous: number = context.getNavigationTarget(-1, 2)
    const pages: number[] = context.getPageTargets()
    const model: CarouselNavigationGeometry | null = context.getNavigationGeometry()
    model?.positionToIndex(context.getPosition(), context.isLoop())
    // @ts-expect-error only forward and backward navigation directions are valid
    context.getNavigationTarget(0)
    void [next, previous, pages]
  },
}

const carousel = new Carousel(document.createElement('div'), slides, {
  geometry, layout, transition, plugins: [plugin],
  breakpoints: { 900: { geometry, layout, transition: createSurfacePageTurn({ perspective: 1000, commitAt: .8 }) } },
})
carousel.update({ geometry, transition: createSurfaceCrossfade({ name: 'soft-fade' }) })
carousel.update({ geometry: undefined })
const model = carousel.getNavigationGeometry()
if (model) {
  const index: number = model.positionToIndex(100, true)
  const pixels: number = model.indexToPosition(index, true)
  const progress: number = model.progress(index, pixels, true)
  const logical: number = model.logicalPosition(pixels, true)
  const max: number = model.bounds.max
  const slots = model.getSlots([{ index }, { index, copy: 1 }], pixels, true)
  // @ts-expect-error navigation models cannot be mutated by consumers
  model.step = 100
  // @ts-expect-error snap points are immutable
  model.snapPoints.push(10)
  // @ts-expect-error geometry slot records are readonly
  slots[0].size = 100
  void [progress, logical, max]
}

carousel.on('slides:change', ({ updated, fields }) => {
  const index: number | undefined = updated?.[0]
  const field: 'content' | 'lazy' | 'meta' | 'thumb' | undefined = fields?.[0]
  void [index, field]
})
carousel.on('geometry:error', ({ name, error }) => { console.error(name, error.message) })

const invalid: CarouselGeometryDefinition = {
  name: 'async',
  // @ts-expect-error geometry measurement must be synchronous
  async measure() { return { slides: [] } },
}
// @ts-expect-error content factories must return a synchronous element or resource
const asyncContent: SlideContentFactory = async () => document.createElement('article')
void [invalid, asyncContent]

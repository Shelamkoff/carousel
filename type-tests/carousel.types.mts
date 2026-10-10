import {
  Carousel,
  carouselStylesUrl,
  createArrows,
  createAutoplay,
  createDots,
  createKeyboard,
  createLazyLoad,
  createParallax,
  createSwipe,
  createThumbnails,
} from '../src/index.js'
import type {
  CarouselOptions,
  CarouselPlugin,
  CarouselEventMap,
  PluginContext,
  SlideData,
} from '../src/index.js'

const node: HTMLElement = document.createElement('div')
const slide: SlideData = {
  content: () => document.createElement('article'),
  thumb: '/thumb.jpg',
  lazy: true,
  meta: { caption: 'example' },
}
const options: CarouselOptions = {
  loop: true,
  ariaLabel: 'Product images',
  slidesPerView: 1,
  slidesPerScroll: 'auto',
  transition: 'slide',
  breakpoints: { 600: { gap: 12, slidesPerView: 2, ariaLabel: 'Image gallery' } },
  plugins: [
    createArrows(),
    createDots(),
    createKeyboard({ scope: 'container' }),
    createSwipe({ mouse: true }),
    createLazyLoad(),
    createParallax(),
    createThumbnails({ position: 'bottom' }),
  ],
}

const carousel = new Carousel(node, [slide], options)
const name: string = carouselStylesUrl
void name

carousel.on('slide:change', ({ index, slide: currentSlide }) => {
  const selected: number = index
  const content: SlideData['content'] = currentSlide.content
  void selected
  void content
})
carousel.on('slide:error', ({ error }) => {
  const problem: Error = error
  void problem
})

const plugin: CarouselPlugin = {
  name: 'example',
  install(ctx: PluginContext) {
    const visibleNodes: HTMLElement[] = ctx.getVisualElements()
    const loaded: boolean = ctx.renderSlide(0)
    const updatedLabel: string | undefined = ctx.options.ariaLabel
    const direction: number = ctx.getPosition()
    ctx.goToAfterDrag(1, 0, 1)
    ctx.snapBack(0)
    void visibleNodes
    void loaded
    void updatedLabel
    void direction
  },
}
carousel.use(plugin)
carousel.update({ gap: 8, ariaLabel: 'Updated gallery' })
carousel.goTo(0)
carousel.addSlide(slide)
carousel.removeSlide(0)
carousel.once('resize', ({ slidesPerView }) => { const n: number = slidesPerView; void n })
carousel.off('destroy', () => {})

// @ts-expect-error Unknown events are not part of the public event map.
carousel.on('not-an-event', () => {})
// @ts-expect-error Plugins are managed via use(), not update().
carousel.update({ plugins: [plugin] })
// @ts-expect-error startIndex is constructor-only.
carousel.update({ startIndex: 1 })
// @ts-expect-error Breakpoint overrides cannot change installed plugins.
const invalidOptions: CarouselOptions = { breakpoints: { 600: { plugins: [plugin] } } }
void invalidOptions

const autoplay = createAutoplay({ interval: 1000 })
autoplay.start()
autoplay.stop()
autoplay.toggle()
const running: boolean = autoplay.isActive()
void running

const event: keyof CarouselEventMap = 'transition:end'
void event
carousel.destroy()

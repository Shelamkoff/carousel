import { Carousel } from '../src/index.js'
import type {
  CarouselTransition,
  CarouselTransitionName,
  CarouselTransitionDefinition,
  CarouselTransitionContext,
  CarouselTransitionInstance,
  CarouselOptions,
} from '../src/index.js'

const presetNames: CarouselTransitionName[] = [
  'slide', 'fade', 'stairs', 'stairs-horizontal', 'pixel', 'curtain',
  'diamond-wipe', 'directional-wipe', 'clock-wipe', 'aperture-wipe',
  'polka-dots', 'grid-flip', 'doorway', 'water-drop',
]
const custom: CarouselTransitionDefinition = {
  name: 'application-wipe',
  create({ container, direction }: CarouselTransitionContext): CarouselTransitionInstance {
    const panel: HTMLElement = container.ownerDocument.createElement('div')
    const movement: 1 | -1 = direction
    container.append(panel)
    return {
      render(progress: number) { panel.style.opacity = String(1 - Math.abs(progress * 2 - 1)); void movement },
      destroy() { panel.remove() },
    }
  },
}
const transitions: CarouselTransition[] = [...presetNames, custom]
for (const transition of transitions) {
  const options: CarouselOptions = { transition, breakpoints: { 600: { transition } } }
  const carousel = new Carousel(document.createElement('div'), [], options)
  carousel.update({ transition })
  carousel.on('transition:error', ({ name, error }) => {
    const transitionName: string = name
    const cause: Error = error
    void [transitionName, cause]
  })
}

// Contextual inference also works without annotations or a helper function.
const inferred: CarouselOptions = {
  transition: {
    name: 'inline-wipe',
    create({ container, direction }) {
      const node: HTMLElement = container
      const movement: 1 | -1 = direction
      return { render(progress) { const value: number = progress; void [node, movement, value] } }
    },
  },
}
void inferred

// @ts-expect-error The word preloader is not a carousel transition.
const invalidTransition: CarouselTransition = 'words'
void invalidTransition

// @ts-expect-error A named definition must provide a factory.
const missingFactory: CarouselTransition = { name: 'incomplete' }
// @ts-expect-error A factory must return a renderable instance synchronously.
const asynchronousFactory: CarouselTransitionDefinition = { name: 'async', async create() { return { render() {} } } }
// @ts-expect-error Progress is a number, not a CSS string.
const invalidRenderer: CarouselTransitionDefinition = { name: 'invalid', create() { return { render(progress: string) { void progress } } } }
void [missingFactory, asynchronousFactory, invalidRenderer]

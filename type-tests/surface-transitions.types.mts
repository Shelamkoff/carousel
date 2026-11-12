import { Carousel, createSurfaceCrossfade, createSurfacePageTurn } from '../src/index.js'
import type { CarouselOptions, CarouselSurfaceTransitionDefinition, CarouselSurfaceTransitionContext } from '../src/index.js'

const options: CarouselOptions = {
  transition: {
    kind: 'surfaces', name: 'inline-surfaces', commitAt: .7,
    createSurfaces({ container, from, to, direction, fromIndex, toIndex, orientation, viewportSize }) {
      const nodes: HTMLElement[] = [container, from, to]
      const movement: 1 | -1 = direction
      const axis: 'horizontal' | 'vertical' = orientation
      const numbers: number[] = [fromIndex, toIndex, viewportSize]
      return { render(progress) { const value: number = progress; void [nodes, movement, axis, numbers, value] } }
    },
  },
}
const definition: CarouselSurfaceTransitionDefinition = {
  kind: 'surfaces', name: 'typed-surfaces',
  createSurfaces(context: CarouselSurfaceTransitionContext) {
    // @ts-expect-error Snapshot identity belongs to the owner.
    context.from = document.createElement('div')
    return { render(progress) { context.from.style.opacity = String(1 - progress) } }
  },
}
const carousel = new Carousel(document.createElement('div'), [], options)
carousel.update({ transition: definition })
carousel.update({ transition: createSurfaceCrossfade({ name: 'crossfade', commitAt: 1 }) })
carousel.update({ transition: createSurfacePageTurn({ perspective: 800 }) })

// @ts-expect-error A surface transition has a required discriminant.
const missingKind: CarouselSurfaceTransitionDefinition = { name: 'missing', createSurfaces() { return { render() {} } } }
// @ts-expect-error A surface factory must return synchronously.
const asynchronous: CarouselSurfaceTransitionDefinition = { kind: 'surfaces', name: 'async', async createSurfaces() { return { render() {} } } }
// @ts-expect-error The old cover factory key is not a surface hook.
const wrongHook: CarouselSurfaceTransitionDefinition = { kind: 'surfaces', name: 'cover', create() { return { render() {} } } }
void [missingKind, asynchronous, wrongHook]
